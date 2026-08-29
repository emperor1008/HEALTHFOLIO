import { createAdminClient } from "@/lib/supabase/admin";
import { getAIProvider } from "@/lib/ai/provider";
import type { AgentRunState } from "./controller";
import { createEvents } from "ics";

type AdminClient = ReturnType<typeof createAdminClient>;
type ToolResult = { success: boolean; data?: unknown; errorCode?: string; artifactType?: string; artifactId?: string; authorizedDownloadPath?: string };

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
      case "document.replace":
        return await replaceDocument(input, userId, admin);
      case "timeline.build":
        return await buildTimeline(input, userId, admin, state);
      case "clarification.request":
        return {
          success: true,
          data: { message: input.message, requestType: input.requestType },
        };
      case "brief.generate":
        return await generateBrief(input, userId, admin, state);
      case "checklist.generate":
        return await generateChecklist(input, userId, admin, state);
      case "calendar.export_ics":
        return await exportIcs(input, userId, admin);
      case "reminder.create":
        return await createReminder(input, userId, admin);
      case "pdf.export":
        return await exportPdf(input, userId, admin, state);
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
    await admin
      .from("documents")
      .update({ status: "failed" })
      .eq("id", documentId);
    return { success: false, errorCode: "DOWNLOAD_FAILED" };
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const { processDocument } = await import("@/lib/documents/ingest");
  const result = await processDocument(buffer, doc.mime_type);

  if (result.totalTextLength < 10) {
    await admin
      .from("documents")
      .update({ status: "review_required" })
      .eq("id", documentId);
    return { success: false, errorCode: "LOW_CONFIDENCE" };
  }

  const provider = getAIProvider();
  let factsCreated = 0;
  let needsReview = 0;

  for (const page of result.pages) {
    if (page.text.length < 10) continue;
    try {
      const cls = await provider.classifyDocument(page.text, page.pageNumber);
      for (const field of cls.fields) {
        const confidence = field.confidence;
        const threshold = parseFloat(
          process.env.EXTRACTION_CONFIDENCE_THRESHOLD || "0.85"
        );
        const requiresReview =
          confidence < threshold ||
          !field.evidenceLocator?.sourceText;

        await admin.from("extractions").insert({
          user_id: userId,
          document_id: documentId,
          page_number: page.pageNumber,
          field_type: field.fieldType,
          raw_value: field.rawValue,
          normalized_value: field.normalizedValue,
          confidence,
          verification_status: requiresReview ? "pending_review" : "system_verified",
          evidence_locator: {
            documentId: doc.id,
            documentName: doc.original_name,
            pageNumber: page.pageNumber,
            sourceText:
              field.evidenceLocator?.sourceText ||
              field.rawValue.substring(0, 200),
          },
        });

        factsCreated++;
        if (requiresReview) needsReview++;
      }

      await admin
        .from("documents")
        .update({
          document_type: cls.documentType,
          page_count: result.pageCount,
          status: needsReview > 0 ? "review_required" : "processed",
        })
        .eq("id", documentId);
    } catch {
      await admin
        .from("documents")
        .update({ status: "failed" })
        .eq("id", documentId);
      return { success: false, errorCode: "AI_EXTRACTION_FAILED" };
    }
  }

  return {
    success: true,
    data: {
      documentId,
      pageCount: result.pageCount,
      factsCreated,
      needsReview,
    },
  };
}

async function replaceDocument(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;
  const replacementDocumentId = input.replacementDocumentId as string;

  // Mark old document as replaced
  await admin
    .from("documents")
    .update({ status: "replaced" })
    .eq("id", documentId)
    .eq("user_id", userId);

  // Mark replacement as the active document
  await admin
    .from("documents")
    .update({ status: "uploaded" })
    .eq("id", replacementDocumentId)
    .eq("user_id", userId);

  // Reject old extractions
  await admin
    .from("extractions")
    .update({ verification_status: "rejected" })
    .eq("document_id", documentId)
    .eq("user_id", userId);

  return {
    success: true,
    data: { documentId, replacementDocumentId },
  };
}

const FIELD_TO_EVENT: Record<string, string> = {
  instruction: "follow_up",
  test: "test",
  clinician: "consultation",
  prescription: "prescription",
  diagnosis_text: "report",
  follow_up: "follow_up",
  date: "other",
  event: "other",
  other: "other",
};

async function buildTimeline(
  _input: Record<string, unknown>,
  userId: string,
  admin: AdminClient,
  state: AgentRunState
): Promise<ToolResult> {
  const { data: extractions } = await admin
    .from("extractions")
    .select("id, field_type, raw_value, normalized_value, document_id")
    .in("document_id", state.documentIds)
    .or(
      "verification_status.eq.user_confirmed,verification_status.eq.user_corrected,verification_status.eq.system_verified"
    );

  if (!extractions?.length)
    return { success: false, errorCode: "NO_VERIFIED_DATA" };

  // Load existing events to avoid duplicates (idempotent build)
  const { data: existingEvents } = await admin
    .from("medical_events")
    .select("id, source_extraction_ids, event_type, event_date, verification_status")
    .eq("portfolio_id", state.portfolioId)
    .eq("user_id", userId);

  const existingMap = new Map(
    (existingEvents || []).map((e) => [e.id, e])
  );

  // Build a lookup from extraction IDs to existing event IDs
  const extractionToEvent = new Map<string, string>();
  for (const evt of existingEvents || []) {
    const srcIds = (evt.source_extraction_ids || []) as string[];
    for (const srcId of srcIds) {
      extractionToEvent.set(srcId, evt.id);
    }
  }

  const upserts: Array<Record<string, unknown>> = [];
  const newEvents: Array<Record<string, unknown>> = [];

  // Group extractions by normalized date + type for stable identity
  type ExtractionRecord = { id: string; field_type: string; raw_value: string; normalized_value: Record<string, unknown>; document_id: string };
  const grouped = new Map<string, ExtractionRecord[]>();
  for (const e of extractions as ExtractionRecord[]) {
    const norm = e.normalized_value as Record<string, unknown>;
    const date =
      (norm.date as string) ||
      e.raw_value.match(/\d{4}-\d{2}-\d{2}/)?.[0] ||
      "unknown";
    const type = FIELD_TO_EVENT[e.field_type] || "other";
    const key = `${date}:${type}`;
    const existing = grouped.get(key) || [];
    existing.push(e);
    grouped.set(key, existing);
  }

  let eventsCreated = 0;
  let eventsUpdated = 0;

  for (const [, group] of Array.from(grouped.entries())) {
    const norm = group[0].normalized_value as Record<string, unknown>;
    const date =
      (norm.date as string) ||
      group[0].raw_value.match(/\d{4}-\d{2}-\d{2}/)?.[0] ||
      null;
    const type = FIELD_TO_EVENT[group[0].field_type] || "other";
    const extractionIds = group.map((e) => e.id);

    // Find existing event that shares extraction IDs
    let existingEventId: string | null = null;
    for (const srcId of extractionIds) {
      const evtId = extractionToEvent.get(srcId);
      if (evtId) {
        existingEventId = evtId;
        break;
      }
    }

    if (existingEventId && existingMap.has(existingEventId)) {
      // Update existing: merge extraction IDs, preserve user corrections
      const existing = existingMap.get(existingEventId)!;
      const mergedIds = Array.from(
        new Set([
          ...((existing.source_extraction_ids as string[]) || []),
          ...extractionIds,
        ])
      );

      upserts.push({
        id: existingEventId,
        source_extraction_ids: mergedIds,
        title: group[0].raw_value.substring(0, 200),
        description: group[0].raw_value,
        event_date: date,
      });
      eventsUpdated++;
    } else {
      // Create new event
      newEvents.push({
        user_id: userId,
        portfolio_id: state.portfolioId,
        event_date: date,
        event_type: type,
        title: group[0].raw_value.substring(0, 200),
        description: group[0].raw_value,
        source_extraction_ids: extractionIds,
        verification_status: "verified",
      });
      eventsCreated++;
    }
  }

  // Upsert existing events
  for (const upsert of upserts) {
    const id = upsert.id as string;
    const { id: _id, ...fields } = upsert;
    await admin.from("medical_events").update(fields).eq("id", id);
  }

  // Insert new events
  if (newEvents.length > 0) {
    await admin.from("medical_events").insert(newEvents);
  }

  return {
    success: true,
    data: { eventsCreated, eventsUpdated, total: eventsCreated + eventsUpdated },
  };
}

async function generateBrief(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient,
  state: AgentRunState
): Promise<ToolResult> {
  const portfolioId = (input.portfolioId as string) || state.portfolioId;

  const [
    { data: events },
    { data: appointment },
    { data: documents },
  ] = await Promise.all([
    admin
      .from("medical_events")
      .select("id, event_date, event_type, title, description, source_extraction_ids")
      .eq("portfolio_id", portfolioId)
      .eq("user_id", userId)
      .order("event_date", { ascending: true }),
    admin
      .from("appointments")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .eq("user_id", userId)
      .eq("status", "planned")
      .order("starts_at", { ascending: true })
      .limit(1)
      .single(),
    admin
      .from("documents")
      .select("id, original_name, document_type, status")
      .eq("portfolio_id", portfolioId)
      .eq("user_id", userId),
  ]);

  const provider = getAIProvider();
  let questions: string[];
  let checklist: string[];

  try {
    [questions, checklist] = await Promise.all([
      provider.generateQuestions(state.goal, events || [], appointment?.specialty),
      provider.generateChecklist(state.goal, events || []),
    ]);
  } catch {
    // AI unavailable — do not fabricate content. Mark as blocked.
    questions = [];
    checklist = [];
  }

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
      date: e.event_date,
      type: e.event_type,
      title: e.title,
      description: e.description,
      sourceDocumentId: "",
      sourceDocumentName: "",
      pageNumber: 0,
    })),
    documentsIncluded: (documents || [])
      .filter((d) => d.status !== "failed" && d.status !== "excluded")
      .map((d) => ({ name: d.original_name, type: d.document_type })),
    documentsMissing: (documents || [])
      .filter((d) => d.status === "failed")
      .map((d) => d.original_name),
    questionsToDiscuss: questions,
    preparationChecklist: checklist,
    safetyDisclaimer: SAFETY_DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };

  await admin
    .from("briefs")
    .update({ status: "stale" })
    .eq("portfolio_id", portfolioId)
    .eq("user_id", userId)
    .eq("status", "approved");

  const { data: brief } = await admin
    .from("briefs")
    .insert({
      user_id: userId,
      portfolio_id: portfolioId,
      appointment_id: appointment?.id || null,
      content,
      status: "draft",
      version: 1,
    })
    .select("id")
    .single();

  return { success: true, data: { briefId: brief?.id } };
}

async function generateChecklist(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient,
  state: AgentRunState
): Promise<ToolResult> {
  const portfolioId = (input.portfolioId as string) || state.portfolioId;

  const [{ data: events }, { data: appointment }] = await Promise.all([
    admin
      .from("medical_events")
      .select("event_date, event_type, title")
      .eq("portfolio_id", portfolioId)
      .eq("user_id", userId),
    admin
      .from("appointments")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .eq("user_id", userId)
      .eq("status", "planned")
      .order("starts_at", { ascending: true })
      .limit(1)
      .single(),
  ]);

  const provider = getAIProvider();
  let checklist: string[];
  try {
    checklist = await provider.generateChecklist(state.goal, events || []);
  } catch {
    // AI unavailable — return empty checklist rather than fake data
    checklist = [];
  }

  if (checklist.length === 0) {
    return {
      success: false,
      errorCode: "AI_CONFIGURATION_REQUIRED",
      data: { message: "AI is not configured. Checklist requires AI generation." },
    };
  }

  return {
    success: true,
    data: {
      checklist,
      appointmentDate: appointment?.starts_at || null,
    },
  };
}

async function exportPdf(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient,
  state: AgentRunState
): Promise<ToolResult> {
  const briefId = input.briefId as string;
  const portfolioId = state.portfolioId;

  // Verify brief exists and belongs to user
  const { data: brief } = await admin
    .from("briefs")
    .select("id, content, status")
    .eq("id", briefId)
    .eq("user_id", userId)
    .single();

  if (!brief) return { success: false, errorCode: "BRIEF_NOT_FOUND" };

  if (brief.status !== "approved" && brief.status !== "draft") {
    return { success: false, errorCode: "BRIEF_NOT_APPROVED" };
  }

  // Generate real PDF
  try {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const content = brief.content as Record<string, unknown>;
    const appt = (content.appointmentDetails || {}) as Record<string, string | null>;

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Healthfolio Consultation Brief", margin, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (appt.date) { doc.text(`Date: ${appt.date}`, margin, y); y += 5; }
    if (appt.time) { doc.text(`Time: ${appt.time}`, margin, y); y += 5; }
    if (appt.specialty) { doc.text(`Specialty: ${appt.specialty}`, margin, y); y += 5; }
    y += 5;

    // Goal
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Preparation Goal", margin, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const goalLines = doc.splitTextToSize((content.goal as string) || "", pageWidth - 2 * margin);
    doc.text(goalLines, margin, y);
    y += goalLines.length * 4 + 5;

    // Questions
    const questions = (content.questionsToDiscuss || []) as string[];
    if (questions.length > 0) {
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Questions to Discuss", margin, y);
      y += 6;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      for (const q of questions) {
        if (y > 270) { doc.addPage(); y = margin; }
        const qLines = doc.splitTextToSize(`• ${q}`, pageWidth - 2 * margin);
        doc.text(qLines, margin, y);
        y += qLines.length * 4 + 2;
      }
    }

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    // Store in audit
    await admin.from("audit_events").insert({
      user_id: userId,
      action: "export",
      resource_type: "brief",
      resource_id: briefId,
    });

    return {
      success: true,
      artifactType: "pdf",
      artifactId: briefId,
      authorizedDownloadPath: `/api/briefs/${briefId}/pdf`,
      data: {
        briefId,
        sizeBytes: pdfBuffer.length,
      },
    };
  } catch {
    return { success: false, errorCode: "PDF_GENERATION_FAILED" };
  }
}

async function exportIcs(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const appointmentId = input.appointmentId as string;

  const { data: appointment, error: apptError } = await admin
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .eq("user_id", userId)
    .single();

  if (apptError || !appointment) {
    return { success: false, errorCode: "APPOINTMENT_NOT_FOUND" };
  }

  const apptDate = new Date(appointment.starts_at);
  const year = apptDate.getFullYear();
  const month = apptDate.getMonth() + 1;
  const day = apptDate.getDate();
  const hours = apptDate.getHours();
  const minutes = apptDate.getMinutes();
  const endHours = hours + 1;

  const eventTitle = appointment.specialty
    ? `Healthfolio: ${appointment.specialty} Appointment`
    : "Healthfolio: Medical Appointment";

  const { value, error } = createEvents([
    {
      start: [year, month, day, hours, minutes],
      end: [year, month, day, endHours, minutes],
      title: eventTitle,
      description: `Healthfolio consultation preparation\\n${SAFETY_DISCLAIMER}`,
      location: appointment.location || undefined,
      status: "CONFIRMED",
      calName: "Healthfolio",
      startInputType: "local",
      startOutputType: "local",
      endInputType: "local",
      endOutputType: "local",
    },
  ]);

  if (error) {
    return { success: false, errorCode: "ICS_GENERATION_FAILED" };
  }

  return {
    success: true,
    data: { icsContent: value, appointmentId },
  };
}

async function createReminder(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const appointmentId = input.appointmentId as string;

  const { data: existing } = await admin
    .from("reminders")
    .select("id")
    .eq("appointment_id", appointmentId)
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .limit(1);

  if (existing?.length)
    return { success: true, data: { reminderId: existing[0].id } };

  const { data: appt } = await admin
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .eq("user_id", userId)
    .single();

  if (!appt) return { success: false, errorCode: "APPOINTMENT_NOT_FOUND" };

  const remindAt = new Date(appt.starts_at);
  remindAt.setDate(remindAt.getDate() - 1);
  remindAt.setHours(9, 0, 0, 0);

  const { data: reminder } = await admin
    .from("reminders")
    .insert({
      user_id: userId,
      appointment_id: appointmentId,
      remind_at: remindAt.toISOString(),
      channel: "in_app",
      status: "scheduled",
      message: (input.message as string) || "Appointment reminder",
    })
    .select("id")
    .single();

  return { success: true, data: { reminderId: reminder?.id } };
}
