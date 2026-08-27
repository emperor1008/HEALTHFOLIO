import { createAdminClient } from "@/lib/supabase/admin";
import { getAIProvider } from "@/lib/ai/provider";
import type { AgentRunState } from "./controller";

type AdminClient = ReturnType<typeof createAdminClient>;
type ToolResult = { success: boolean; data?: unknown; errorCode?: string };

const SAFETY_DISCLAIMER =
  "Healthfolio organizes medical information and helps you prepare for consultations. It does not diagnose conditions, recommend treatment, or replace a healthcare professional.";

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string,
  state: AgentRunState
): Promise<ToolResult> {
  const admin = createAdminClient();
  try {
    switch (name) {
      case "document.ingest":
        return await ingest(input, userId, admin);
      case "document.extract":
        return await extract(input, userId, admin);
      case "timeline.build":
        return await buildTimeline(input, userId, admin, state);
      case "clarification.request":
        return { success: true, data: { message: input.message, requestType: input.requestType } };
      case "brief.generate":
        return await generateBrief(input, userId, admin, state);
      case "reminder.create":
        return await createReminder(input, userId, admin);
      default:
        return { success: false, errorCode: "UNKNOWN_TOOL" };
    }
  } catch {
    return { success: false, errorCode: "TOOL_EXECUTION_FAILED" };
  }
}

async function ingest(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  await admin
    .from("documents")
    .update({ status: "processing" })
    .eq("id", input.documentId)
    .eq("user_id", userId);
  return { success: true, data: { documentId: input.documentId } };
}

async function extract(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;

  const { data: doc } = await admin
    .from("documents")
    .select("id, storage_path, mime_type, original_name")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (!doc) return { success: false, errorCode: "DOCUMENT_NOT_FOUND" };

  const { data: fileData, error: dlErr } = await admin.storage
    .from("documents")
    .download(doc.storage_path);

  if (dlErr || !fileData) {
    await admin.from("documents").update({ status: "failed" }).eq("id", documentId);
    return { success: false, errorCode: "DOWNLOAD_FAILED" };
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const { processDocument } = await import("@/lib/documents/ingest");
  const result = await processDocument(buffer, doc.mime_type);

  if (result.totalTextLength < 10) {
    await admin.from("documents").update({ status: "review_required" }).eq("id", documentId);
    return { success: false, errorCode: "LOW_CONFIDENCE" };
  }

  const threshold = parseFloat(process.env.EXTRACTION_CONFIDENCE_THRESHOLD || "0.85");
  const provider = getAIProvider();

  for (const page of result.pages) {
    if (page.text.length < 10) continue;
    try {
      const cls = await provider.classifyDocument(page.text, page.pageNumber);
      for (const field of cls.fields) {
        await admin.from("extractions").insert({
          user_id: userId,
          document_id: documentId,
          page_number: page.pageNumber,
          field_type: field.fieldType,
          raw_value: field.rawValue,
          normalized_value: field.normalizedValue,
          confidence: field.confidence,
          verification_status: "pending",
          evidence_locator: {
            documentId: doc.id,
            documentName: doc.original_name,
            pageNumber: page.pageNumber,
            sourceText: field.evidenceLocator.sourceText || field.rawValue.substring(0, 200),
          },
        });
      }
      await admin.from("documents").update({
        document_type: cls.documentType,
        page_count: result.pageCount,
        status: "review_required",
      }).eq("id", documentId);
    } catch {
      await admin.from("documents").update({ status: "failed" }).eq("id", documentId);
      return { success: false, errorCode: "AI_EXTRACTION_FAILED" };
    }
  }

  return { success: true, data: { documentId, pageCount: result.pageCount } };
}

const FIELD_TO_EVENT: Record<string, string> = {
  instruction: "follow_up",
  test: "test",
  clinician: "consultation",
  prescription: "prescription",
  diagnosis_text: "report",
  follow_up: "follow_up",
};

async function buildTimeline(
  _input: Record<string, unknown>,
  userId: string,
  admin: AdminClient,
  state: AgentRunState
): Promise<ToolResult> {
  const { data: extractions } = await admin
    .from("extractions")
    .select("id, field_type, raw_value, normalized_value")
    .in("document_id", state.documentIds)
    .or("verification_status.eq.user_confirmed,verification_status.eq.user_corrected");

  if (!extractions?.length) return { success: false, errorCode: "NO_VERIFIED_DATA" };

  const events = extractions.map((e) => {
    const norm = e.normalized_value as Record<string, unknown>;
    return {
      user_id: userId,
      portfolio_id: state.portfolioId,
      event_date: (norm.date as string) || e.raw_value.match(/\d{4}-\d{2}-\d{2}/)?.[0] || null,
      event_type: FIELD_TO_EVENT[e.field_type] || "other",
      title: e.raw_value.substring(0, 200),
      description: e.raw_value,
      source_extraction_ids: [e.id],
      verification_status: "verified",
    };
  });

  await admin.from("medical_events").insert(events);
  return { success: true, data: { eventsCreated: events.length } };
}

async function generateBrief(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient,
  state: AgentRunState
): Promise<ToolResult> {
  const portfolioId = (input.portfolioId as string) || state.portfolioId;

  const [{ data: events }, { data: appointment }, { data: documents }] = await Promise.all([
    admin.from("medical_events")
      .select("id, event_date, event_type, title, description, source_extraction_ids")
      .eq("portfolio_id", portfolioId).eq("user_id", userId)
      .order("event_date", { ascending: true }),
    admin.from("appointments").select("*")
      .eq("portfolio_id", portfolioId).eq("user_id", userId)
      .eq("status", "planned").order("starts_at", { ascending: true })
      .limit(1).single(),
    admin.from("documents")
      .select("id, original_name, document_type, status")
      .eq("portfolio_id", portfolioId).eq("user_id", userId),
  ]);

  const provider = getAIProvider();
  const [questions, checklist] = await Promise.all([
    provider.generateQuestions(state.goal, events || [], appointment?.specialty).catch(() => [
      "What should I bring to the appointment?",
      "Are there any follow-up tests needed?",
    ]),
    provider.generateChecklist(state.goal, events || []).catch(() => [
      "Carry all original documents",
      "Bring a list of current medications",
    ]),
  ]);

  const content = {
    appointmentDetails: {
      date: appointment?.starts_at?.split("T")[0] || null,
      time: appointment?.starts_at?.split("T")[1]?.substring(0, 5) || null,
      timezone: appointment?.timezone || "Asia/Kolkata",
      specialty: appointment?.specialty || null,
      clinicianName: appointment?.clinician_name || null,
      location: appointment?.location || null,
    },
    goal: state.goal,
    verifiedEvents: (events || []).map((e) => ({
      date: e.event_date, type: e.event_type, title: e.title,
      description: e.description, sourceDocumentId: "", sourceDocumentName: "", pageNumber: 0,
    })),
    documentsIncluded: (documents || [])
      .filter((d) => d.status !== "failed" && d.status !== "excluded")
      .map((d) => ({ name: d.original_name, type: d.document_type })),
    documentsMissing: (documents || []).filter((d) => d.status === "failed").map((d) => d.original_name),
    questionsToDiscuss: questions,
    preparationChecklist: checklist,
    safetyDisclaimer: SAFETY_DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };

  await admin.from("briefs")
    .update({ status: "stale" })
    .eq("portfolio_id", portfolioId).eq("user_id", userId).eq("status", "approved");

  const { data: brief } = await admin.from("briefs").insert({
    user_id: userId, portfolio_id: portfolioId,
    appointment_id: appointment?.id || null,
    content, status: "draft", version: 1,
  }).select("id").single();

  return { success: true, data: { briefId: brief?.id } };
}

async function createReminder(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const appointmentId = input.appointmentId as string;

  const { data: existing } = await admin
    .from("reminders").select("id")
    .eq("appointment_id", appointmentId).eq("user_id", userId)
    .eq("status", "scheduled").limit(1);

  if (existing?.length) return { success: true, data: { reminderId: existing[0].id } };

  const { data: appt } = await admin
    .from("appointments").select("*")
    .eq("id", appointmentId).eq("user_id", userId).single();

  if (!appt) return { success: false, errorCode: "APPOINTMENT_NOT_FOUND" };

  const remindAt = new Date(appt.starts_at);
  remindAt.setDate(remindAt.getDate() - 1);
  remindAt.setHours(9, 0, 0, 0);

  const { data: reminder } = await admin.from("reminders").insert({
    user_id: userId, appointment_id: appointmentId,
    remind_at: remindAt.toISOString(), channel: "in_app",
    status: "scheduled", message: (input.message as string) || "Appointment reminder",
  }).select("id").single();

  return { success: true, data: { reminderId: reminder?.id } };
}
