import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider } from "@/lib/ai/provider";
import type { AgentRunState } from "./controller";
import { createEvents } from "ics";
import {
  runSignalMonitorForMeasurement,
  archiveSignalsForInvalidatedMeasurement,
} from "@/lib/signals/service";

type AdminClient = SupabaseClient;
type ToolResult = { success: boolean; data?: unknown; errorCode?: string; artifactType?: string; artifactId?: string; authorizedDownloadPath?: string };

const SAFETY_DISCLAIMER =
  "Healthfolio organizes medical information and helps you prepare for consultations. It does not diagnose conditions, recommend treatment, or replace a healthcare professional.";

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string,
  state: AgentRunState
): Promise<ToolResult> {
  const admin = await createAdminClient();
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
      case "measurement.extract":
        return await extractMeasurements(input, userId, admin);
      case "measurement.verify":
        return await verifyMeasurement(input, userId, admin);
      case "trend.compute":
        return await computeTrend(input, userId, admin);
      case "trend.rebuild":
        return await rebuildMeasurements(input, userId, admin);
      // Feature 2: Document Organization
      case "document.check_duplicate":
        return await checkDocumentDuplicate(input, userId, admin);
      case "document.classify_ai":
        return await classifyWithAI(input, userId, admin);
      case "document.extract_metadata":
        return await extractDocumentMetadata(input, userId, admin);
      case "document.extract_prescription_items":
        return await extractDocumentPrescriptionItems(input, userId, admin);
      case "document.organize":
        return await organizeDocumentTool(input, userId, admin);
      case "document.find_relationships":
        return await findDocumentRelationships(input, userId, admin);
      case "document.verify_organization":
        return await verifyDocumentOrganization(input, userId, admin);
      // Feature 4: Test Report Intelligence
      case "report.inspect":
        return await inspectReport(input, userId, admin);
      case "report.extract_text":
        return await extractReportText(input, userId, admin);
      case "report.extract_measurements":
        return await extractReportMeasurements(input, userId, admin);
      case "test.resolve_identity":
        return await resolveTestIdentity(input, userId, admin);
      case "measurement.validate_range":
        return await validateMeasurementRange(input, userId, admin);
      case "measurement.request_review":
        return await requestMeasurementReview(input, userId, admin);
      case "report.generate_safe_summary":
        return await generateReportSummary(input, userId, admin);
      case "test.retrieve_information":
        return await retrieveTestInformation(input, userId, admin);
      case "report.finalize":
        return await finalizeReport(input, userId, admin);
      // Feature 6: Medication Routine Agent
      case "routine.inspect_prescription":
        return await inspectPrescription(input, userId, admin);
      case "routine.extract_schedule":
        return await extractSchedule(input, userId, admin);
      case "routine.validate_schedule":
        return await validateSchedule(input, userId, admin);
      case "routine.detect_conflicts":
        return await detectRoutineConflicts(input, userId, admin);
      case "routine.request_confirmation":
        return await requestRoutineConfirmation(input, userId, admin);
      case "routine.activate":
        return await activateRoutine(input, userId, admin);
      case "routine.generate_occurrences":
        return await generateRoutineOccurrences(input, userId, admin);
      case "routine.pause":
        return await pauseRoutine(input, userId, admin);
      case "routine.revise":
        return await reviseRoutine(input, userId, admin);
      case "routine.invalidate":
        return await invalidateRoutine(input, userId, admin);
      case "reminder.record_response":
        return await recordReminderResponse(input, userId, admin);
      case "routine.complete":
        return await completeRoutine(input, userId, admin);
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

async function extractMeasurements(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;
  const pageNumber = input.pageNumber as number;

  // Get the document
  const { data: doc } = await admin
    .from("documents")
    .select("id, storage_path, mime_type, original_name, portfolio_id")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (!doc) return { success: false, errorCode: "DOCUMENT_NOT_FOUND" };

  // Download and process document
  const { data: fileData, error: dlErr } = await admin.storage
    .from("documents")
    .download(doc.storage_path);

  if (dlErr || !fileData) {
    return { success: false, errorCode: "DOWNLOAD_FAILED" };
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const { processDocument } = await import("@/lib/documents/ingest");
  const result = await processDocument(buffer, doc.mime_type);

  const page = result.pages.find((p) => p.pageNumber === pageNumber);
  if (!page || page.text.length < 10) {
    return { success: false, errorCode: "LOW_CONFIDENCE" };
  }

  // Use AI to extract measurements
  const provider = getAIProvider();
  let measurements: Array<Record<string, unknown>> = [];

  try {
    const { MedicalMeasurementExtractionSchema } = await import("@/lib/ai/schemas");
    const { normalizeTestName, normalizeUnit, buildSourceFingerprint } = await import("@/lib/measurements/normalization");
    const { calculateRangeStatus } = await import("@/lib/measurements/status");

    // Ask AI to extract measurements from this page
    const extractionPrompt = `Analyze this medical document page and extract ALL measurement/test results.

For EACH measurement found, extract:
- originalTestName: The exact test name as printed
- normalizedTestName: Lowercase, normalized version
- valueNumeric: The numeric value (if numeric)
- valueText: The text value (if not numeric, e.g., "Positive", "Negative")
- originalUnit: The exact unit as printed
- referenceLow: Lower bound of reference range (if numeric)
- referenceHigh: Upper bound of reference range (if numeric)
- referenceText: Full reference range text as printed
- reportFlag: Any flag like "High", "Low", "Abnormal"
- specimenCollectedAt: When specimen was collected (ISO format)
- observedAt: When test was observed (ISO format)
- reportIssuedAt: When report was issued (ISO format)
- pageNumber: ${pageNumber}
- evidenceText: Short excerpt of the evidence for this measurement
- confidence: 0.0-1.0 based on text clarity

Return a JSON array of MedicalMeasurementExtraction objects.
If no measurements are found, return an empty array.
Only extract information explicitly present in the document.
Never guess dates, values, or units.`;

    const messages = [
      { role: "system", content: extractionPrompt },
      { role: "user", content: `Document text from page ${pageNumber}:\n\n${page.text.substring(0, 6000)}` },
    ];

    // Call AI provider
    const { z } = await import("zod");
    const ArraySchema = z.array(MedicalMeasurementExtractionSchema);
    const response = await provider.callStructuredChat(
      messages as Array<{ role: string; content: string }>,
      ArraySchema,
      { temperature: 0.1 }
    );

    // Validate response
    if (!Array.isArray(response)) {
      return { success: true, data: { measurementsExtracted: 0 } };
    }

    for (const item of response) {
      try {
        const validated = MedicalMeasurementExtractionSchema.parse(item);
        const normalizedTestName = normalizeTestName(validated.originalTestName);
        const normalizedUnit = normalizeUnit(validated.originalUnit);
        const fingerprint = buildSourceFingerprint({
          documentId,
          pageNumber,
          normalizedTestName,
          evidenceText: validated.evidenceText,
        });

        const calculatedStatus = calculateRangeStatus({
          valueNumeric: validated.valueNumeric,
          referenceLow: validated.referenceLow,
          referenceHigh: validated.referenceHigh,
          reportFlag: validated.reportFlag,
        });

        // Check for duplicate fingerprint
        const { data: existing } = await admin
          .from("medical_measurements")
          .select("id")
          .eq("source_fingerprint", fingerprint)
          .limit(1);

        if (existing?.length) continue;

        // Insert measurement
        await admin.from("medical_measurements").insert({
          user_id: userId,
          portfolio_id: doc.portfolio_id,
          document_id: documentId,
          original_test_name: validated.originalTestName,
          normalized_test_name: normalizedTestName,
          value_numeric: validated.valueNumeric,
          value_text: validated.valueText,
          original_unit: validated.originalUnit,
          normalized_unit: normalizedUnit,
          reference_low: validated.referenceLow,
          reference_high: validated.referenceHigh,
          reference_text: validated.referenceText,
          report_flag: validated.reportFlag,
          calculated_status: calculatedStatus,
          specimen_collected_at: validated.specimenCollectedAt,
          observed_at: validated.observedAt,
          report_issued_at: validated.reportIssuedAt,
          page_number: pageNumber,
          evidence_text: validated.evidenceText,
          confidence: validated.confidence,
          verification_status: "pending",
          source_fingerprint: fingerprint,
        });

        measurements.push({
          test: validated.originalTestName,
          value: validated.valueNumeric ?? validated.valueText,
          unit: validated.originalUnit,
        });
      } catch {
        // Skip invalid items — never store partial data
        continue;
      }
    }

    return {
      success: true,
      data: {
        measurementsExtracted: measurements.length,
        measurements,
      },
    };
  } catch {
    return { success: false, errorCode: "AI_EXTRACTION_FAILED" };
  }
}

async function verifyMeasurement(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const measurementId = input.measurementId as string;
  const decision = input.decision as string;
  const correctedValue = input.correctedValue as number | null;

  // Verify ownership
  const { data: measurement } = await admin
    .from("medical_measurements")
    .select("id, user_id")
    .eq("id", measurementId)
    .eq("user_id", userId)
    .single();

  if (!measurement) return { success: false, errorCode: "NOT_FOUND" };

  const updateData: Record<string, unknown> = {
    verification_status: decision,
    updated_at: new Date().toISOString(),
  };

  if (decision === "corrected" && correctedValue !== null) {
    updateData.value_numeric = correctedValue;
  }

  if (decision === "rejected") {
    updateData.invalidated_at = new Date().toISOString();
  }

  await admin
    .from("medical_measurements")
    .update(updateData)
    .eq("id", measurementId);

  // Health Signal Monitor: deterministic post-review hook (never throws).
  if (decision === "verified" || decision === "corrected") {
    await runSignalMonitorForMeasurement(admin, userId, measurementId);
  } else if (decision === "rejected") {
    await archiveSignalsForInvalidatedMeasurement(admin, userId, measurementId, "measurement_rejected");
  }

  return {
    success: true,
    data: { measurementId, verificationStatus: decision },
  };
}

async function rebuildMeasurements(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;

  // Invalidate all measurements from this document
  await admin
    .from("medical_measurements")
    .update({ invalidated_at: new Date().toISOString() })
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .is("invalidated_at", null);

  // Archive open signals that reference the invalidated measurements.
  await archiveSignalsForInvalidatedMeasurement(
    admin,
    userId,
    documentId,
    "measurement_invalidated"
  );

  return {
    success: true,
    data: { documentId, message: "Measurements invalidated. Re-extract to rebuild." },
  };
}

async function computeTrend(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const normalizedTestName = input.normalizedTestName as string;

  if (!normalizedTestName) {
    return { success: false, errorCode: "INVALID_INPUT" };
  }

  // Fetch verified/corrected, non-invalidated measurements for this test
  const { data: measurements, error } = await admin
    .from("medical_measurements")
    .select("*")
    .eq("user_id", userId)
    .eq("normalized_test_name", normalizedTestName)
    .in("verification_status", ["verified", "corrected"])
    .is("invalidated_at", null)
    .order("observed_at", { ascending: true, nullsFirst: false });

  if (error || !measurements) {
    return { success: false, errorCode: "QUERY_FAILED" };
  }

  if (measurements.length === 0) {
    return {
      success: true,
      data: {
        normalizedTestName,
        graphEligible: false,
        reason: "No verified measurements found.",
        totalMeasurements: 0,
        graphableMeasurements: 0,
        points: [],
        trend: null,
      },
    };
  }

  // Check unit consistency
  const units = new Set(
    measurements
      .filter((m) => m.normalized_unit)
      .map((m) => m.normalized_unit)
  );
  const unitsIncompatible = units.size > 1;

  if (unitsIncompatible) {
    return {
      success: true,
      data: {
        normalizedTestName,
        graphEligible: false,
        reason: "These results use different units and cannot yet be compared safely.",
        totalMeasurements: measurements.length,
        graphableMeasurements: 0,
        points: [],
        trend: null,
      },
    };
  }

  // Build graph-eligible points using existing trend functions
  const { buildGraphPoints, calculateTrendSummary } = await import("@/lib/measurements/trends");
  const points = buildGraphPoints(measurements);
  const trend = calculateTrendSummary(normalizedTestName, measurements);

  const graphEligible = points.length >= 2;

  return {
    success: true,
    data: {
      normalizedTestName,
      graphEligible,
      reason: graphEligible
        ? undefined
        : `Need at least 2 comparable measurements, found ${points.length}.`,
      totalMeasurements: measurements.length,
      graphableMeasurements: points.length,
      points,
      trend,
    },
  };
}

// ─── Feature 2: Document Organization Tools ───────────────────────────────

async function checkDocumentDuplicate(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const { checkDuplicate } = await import("@/lib/documents/organize");
  const fileHash = input.fileHash as string;

  if (!fileHash) {
    return { success: false, errorCode: "INVALID_INPUT" };
  }

  const result = await checkDuplicate(userId, fileHash);
  return {
    success: true,
    data: result,
  };
}

async function classifyWithAI(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;
  const extractedText = input.extractedText as string;
  const mimeType = input.mimeType as string;

  if (!documentId || !extractedText) {
    return { success: false, errorCode: "INVALID_INPUT" };
  }

  if (extractedText.trim().length < 10) {
    return { success: false, errorCode: "INSUFFICIENT_TEXT" };
  }

  // Verify ownership
  const { data: doc } = await admin
    .from("documents")
    .select("id, user_id")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (!doc) {
    return { success: false, errorCode: "DOCUMENT_NOT_FOUND" };
  }

  // Update processing status
  await admin
    .from("documents")
    .update({ processing_status: "classifying", updated_at: new Date().toISOString() })
    .eq("id", documentId);

  try {
    const { classifyDocument, recordClassificationHistory } = await import("@/lib/documents/organize");
    const classification = await classifyDocument(documentId, extractedText, mimeType);

    // Record classification history
    await recordClassificationHistory({
      userId,
      documentId,
      proposedCategory: classification.category,
      confidence: classification.confidence,
      source: "ai",
      evidence: classification.evidence,
      decision: "proposed",
    });

    return {
      success: true,
      data: {
        category: classification.category,
        confidence: classification.confidence,
        title: classification.title,
        summary: classification.summary,
        warnings: classification.warnings,
        prescriptionItemCount: classification.prescriptionItems?.length || 0,
      },
    };
  } catch (err) {
    const errorCode = err instanceof Error ? err.message : "CLASSIFICATION_FAILED";
    await admin
      .from("documents")
      .update({
        processing_status: "failed",
        failure_code: errorCode,
        failure_message: `Classification failed: ${errorCode}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    return { success: false, errorCode };
  }
}

async function extractDocumentMetadata(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;
  const classificationResult = input.classificationResult as Record<string, unknown>;

  if (!documentId || !classificationResult) {
    return { success: false, errorCode: "INVALID_INPUT" };
  }

  const { extractMetadata } = await import("@/lib/documents/organize");
  const result = await extractMetadata(
    documentId,
    userId,
    classificationResult as any
  );

  return result;
}

async function extractDocumentPrescriptionItems(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;
  const classificationResult = input.classificationResult as Record<string, unknown>;

  if (!documentId || !classificationResult) {
    return { success: false, errorCode: "INVALID_INPUT" };
  }

  const { extractPrescriptionItems } = await import("@/lib/documents/organize");
  const result = await extractPrescriptionItems(
    documentId,
    userId,
    classificationResult as any
  );

  return result;
}

async function organizeDocumentTool(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;
  const category = input.category as string;
  const confidence = input.confidence as number;

  if (!documentId || !category) {
    return { success: false, errorCode: "INVALID_INPUT" };
  }

  const { organizeDocument } = await import("@/lib/documents/organize");
  const result = await organizeDocument(documentId, userId, category, confidence || 0);

  return result;
}

async function findDocumentRelationships(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;

  if (!documentId) {
    return { success: false, errorCode: "INVALID_INPUT" };
  }

  const { findRelationships } = await import("@/lib/documents/organize");
  const result = await findRelationships(documentId, userId);

  return result;
}

async function verifyDocumentOrganization(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;

  if (!documentId) {
    return { success: false, errorCode: "INVALID_INPUT" };
  }

  // Verify the document is fully organized
  const { data: doc } = await admin
    .from("documents")
    .select("id, category, classification_status, processing_status, title, document_date")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (!doc) {
    return { success: false, errorCode: "DOCUMENT_NOT_FOUND" };
  }

  const isComplete =
    doc.processing_status === "completed" ||
    doc.processing_status === "review_required";

  return {
    success: true,
    data: {
      documentId,
      category: doc.category,
      classificationStatus: doc.classification_status,
      processingStatus: doc.processing_status,
      title: doc.title,
      documentDate: doc.document_date,
      isComplete,
    },
  };
}

// ─── Feature 4: Test Report Intelligence Tools ───────────────────────────

async function inspectReport(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;

  const { data: doc } = await admin
    .from("documents")
    .select("id, mime_type, original_name, status, category, processing_status")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (!doc) return { success: false, errorCode: "DOCUMENT_NOT_FOUND" };

  const isLabReport =
    doc.category === "lab_report" ||
    doc.original_name?.toLowerCase().includes("lab") ||
    doc.original_name?.toLowerCase().includes("test") ||
    doc.original_name?.toLowerCase().includes("report");

  return {
    success: true,
    data: {
      documentId,
      mimeType: doc.mime_type,
      fileName: doc.original_name,
      currentCategory: doc.category,
      isLabReport,
      currentStatus: doc.processing_status,
    },
  };
}

async function extractReportText(
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
    return { success: false, errorCode: "STORAGE_DOWNLOAD_FAILED" };
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const { processDocument } = await import("@/lib/documents/ingest");
  const result = await processDocument(buffer, doc.mime_type);

  if (result.totalTextLength < 10) {
    return { success: false, errorCode: "INSUFFICIENT_TEXT" };
  }

  return {
    success: true,
    data: {
      documentId,
      pageCount: result.pageCount,
      totalTextLength: result.totalTextLength,
      pages: result.pages.map((p) => ({
        pageNumber: p.pageNumber,
        textLength: p.text.length,
      })),
    },
  };
}

async function extractReportMeasurements(
  input: Record<string, unknown>,
  userId: string,
  _admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;

  // Delegate to the report service
  const { extractLabReport } = await import("@/lib/reports/service");
  const result = await extractLabReport({
    documentId,
    userId,
    portfolioId: "", // Will be resolved by the service from document
  });

  if (!result.success) {
    return { success: false, errorCode: result.errorCode || "MEASUREMENT_EXTRACTION_FAILED" };
  }

  return {
    success: true,
    data: {
      reportId: result.reportId,
      measurementsExtracted: result.measurementsExtracted,
      measurementsNeedingReview: result.measurementsNeedingReview,
      summary: result.summary,
    },
  };
}

async function resolveTestIdentity(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const measurementId = input.measurementId as string;
  const proposedTestKey = input.proposedTestKey as string;

  const { data: measurement } = await admin
    .from("medical_measurements")
    .select("id, user_id, normalized_test_name, test_key")
    .eq("id", measurementId)
    .eq("user_id", userId)
    .single();

  if (!measurement) return { success: false, errorCode: "NOT_FOUND" };

  // Update the test_key
  await admin
    .from("medical_measurements")
    .update({ test_key: proposedTestKey })
    .eq("id", measurementId);

  // Record the identity candidate
  await admin.from("test_identity_candidates").insert({
    user_id: userId,
    measurement_id: measurementId,
    proposed_test_key: proposedTestKey,
    proposed_name: measurement.normalized_test_name,
    confidence: 1.0,
    status: "confirmed",
    reviewed_at: new Date().toISOString(),
  });

  return {
    success: true,
    data: { measurementId, testKey: proposedTestKey },
  };
}

async function validateMeasurementRange(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const measurementId = input.measurementId as string;

  const { data: measurement } = await admin
    .from("medical_measurements")
    .select("id, user_id, value_numeric, value_text, reference_low, reference_high, reference_text, report_flag, result_type, comparator")
    .eq("id", measurementId)
    .eq("user_id", userId)
    .single();

  if (!measurement) return { success: false, errorCode: "NOT_FOUND" };

  const { calculateExtendedRangeStatus } = await import("@/lib/reports/range-status");
  const status = calculateExtendedRangeStatus({
    numericValue: measurement.value_numeric,
    referenceLower: measurement.reference_low,
    referenceUpper: measurement.reference_high,
    laboratoryFlagRaw: measurement.report_flag,
    resultType: measurement.result_type || "unknown",
    qualitativeValue: measurement.value_text,
    comparator: measurement.comparator,
  });

  await admin
    .from("medical_measurements")
    .update({ calculated_status: status })
    .eq("id", measurementId);

  return {
    success: true,
    data: { measurementId, calculatedStatus: status },
  };
}

async function requestMeasurementReview(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const measurementId = input.measurementId as string;
  const reason = input.reason as string;

  const { data: measurement } = await admin
    .from("medical_measurements")
    .select("id, user_id")
    .eq("id", measurementId)
    .eq("user_id", userId)
    .single();

  if (!measurement) return { success: false, errorCode: "NOT_FOUND" };

  // Update to pending review
  await admin
    .from("medical_measurements")
    .update({
      verification_status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("id", measurementId);

  return {
    success: true,
    data: { measurementId, reason },
  };
}

async function generateReportSummary(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;

  // Get all measurements for this document
  const { data: measurements } = await admin
    .from("medical_measurements")
    .select("id, calculated_status, verification_status, invalidated_at")
    .eq("document_id", documentId)
    .eq("user_id", userId);

  if (!measurements?.length) {
    return {
      success: true,
      data: { summary: "No measurements found in this report." },
    };
  }

  const verified = measurements.filter(
    (m) => (m.verification_status === "verified" || m.verification_status === "corrected") && !m.invalidated_at
  );
  const total = verified.length;
  const withinRange = verified.filter((m) => m.calculated_status === "within_range").length;
  const aboveRange = verified.filter((m) => m.calculated_status === "above_range").length;
  const belowRange = verified.filter((m) => m.calculated_status === "below_range").length;
  const abnormal = verified.filter((m) => m.calculated_status === "report_marked_abnormal").length;
  const needsReview = measurements.filter((m) => m.verification_status === "pending").length;

  const parts: string[] = [];
  parts.push(`This report contains ${total} verified result${total !== 1 ? "s" : ""}.`);

  const rangeParts: string[] = [];
  if (withinRange > 0) rangeParts.push(`${withinRange} within the laboratory's printed reference range`);
  if (aboveRange > 0) rangeParts.push(`${aboveRange} above range`);
  if (belowRange > 0) rangeParts.push(`${belowRange} below range`);
  if (abnormal > 0) rangeParts.push(`${abnormal} flagged as abnormal`);

  if (rangeParts.length > 0) {
    parts.push(`Based on the ranges printed by the laboratory, ${rangeParts.join(", ")}.`);
  }
  if (needsReview > 0) {
    parts.push(`${needsReview} result${needsReview !== 1 ? "s need" : " needs"} your review.`);
  }
  parts.push("This summary does not provide a diagnosis. Discuss these results with a qualified healthcare professional.");

  const summary = parts.join(" ");

  await admin
    .from("laboratory_reports")
    .update({ public_summary: summary })
    .eq("document_id", documentId);

  return { success: true, data: { summary } };
}

async function retrieveTestInformation(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const testKey = input.testKey as string;

  // Check cache first
  const { data: cached } = await admin
    .from("test_information_cache")
    .select("id, title, official_text, plain_language_text, source_name, source_url, source_identifier, retrieved_at, expires_at")
    .eq("test_key", testKey)
    .gt("expires_at", new Date().toISOString())
    .order("retrieved_at", { ascending: false })
    .limit(1);

  if (cached?.length) {
    return {
      success: true,
      data: {
        testKey,
        source: "cache",
        information: cached[0],
      },
    };
  }

  // Not in cache — mark as needing retrieval
  return {
    success: true,
    data: {
      testKey,
      source: "not_cached",
      information: null,
      message: "Test information not available in cache. Manual retrieval may be needed.",
    },
  };
}

async function finalizeReport(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const documentId = input.documentId as string;

  const { data: report } = await admin
    .from("laboratory_reports")
    .select("id, extraction_status, measurement_count, review_count")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .single();

  if (!report) return { success: false, errorCode: "NOT_FOUND" };

  const { count: pendingCount } = await admin
    .from("medical_measurements")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .eq("verification_status", "pending");

  const reviewStatus = (pendingCount || 0) > 0 ? "review_required" : "completed";

  await admin
    .from("laboratory_reports")
    .update({
      extraction_status: "completed",
      review_status: reviewStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", report.id);

  await admin
    .from("documents")
    .update({
      processing_status: reviewStatus === "review_required" ? "review_required" : "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  return {
    success: true,
    data: {
      reportId: report.id,
      extractionStatus: "completed",
      reviewStatus,
      measurementCount: report.measurement_count,
    },
  };
}

// ─── Feature 6: Medication Routine Agent Tools ──────────────────────────

async function inspectPrescription(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const prescriptionItemId = input.prescriptionItemId as string;

  const { data: item } = await admin
    .from("prescription_items")
    .select("id, user_id, document_id, medicine_name, dose_text, frequency_text, duration_text, instruction_text, confidence, verification_status, evidence_locator")
    .eq("id", prescriptionItemId)
    .eq("user_id", userId)
    .single();

  if (!item) return { success: false, errorCode: "PRESCRIPTION_NOT_FOUND" };

  if (item.verification_status !== "verified" && item.verification_status !== "corrected") {
    return { success: false, errorCode: "PRESCRIPTION_NOT_VERIFIED" };
  }

  // Check for existing active plan
  const { data: existingPlan } = await admin
    .from("medication_plans")
    .select("id, status")
    .eq("prescription_item_id", prescriptionItemId)
    .in("status", ["active", "paused", "review_required"])
    .single();

  return {
    success: true,
    data: {
      prescriptionItemId: item.id,
      documentId: item.document_id,
      medicineName: item.medicine_name,
      doseText: item.dose_text,
      frequencyText: item.frequency_text,
      durationText: item.duration_text,
      instructionText: item.instruction_text,
      confidence: item.confidence,
      evidenceLocator: item.evidence_locator,
      hasActivePlan: !!existingPlan,
      existingPlanStatus: existingPlan?.status || null,
    },
  };
}

async function extractSchedule(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const prescriptionItemId = input.prescriptionItemId as string;
  const extractedText = input.extractedText as string;

  const { data: item } = await admin
    .from("prescription_items")
    .select("id, user_id, document_id, medicine_name, dose_text, frequency_text, duration_text, instruction_text, confidence, evidence_locator")
    .eq("id", prescriptionItemId)
    .eq("user_id", userId)
    .single();

  if (!item) return { success: false, errorCode: "PRESCRIPTION_NOT_FOUND" };

  try {
    const provider = getAIProvider();
    const { ScheduleExtractionSchema, SCHEDULE_EXTRACTION_SYSTEM_PROMPT } = await import("@/lib/routines/extraction-schema");

    const messages = [
      { role: "system" as const, content: SCHEDULE_EXTRACTION_SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: `Extract the medication schedule from this prescription.\n\nMedicine: ${item.medicine_name || "Unknown"}\nDose: ${item.dose_text || "Not specified"}\nFrequency: ${item.frequency_text || "Not specified"}\nDuration: ${item.duration_text || "Not specified"}\nInstruction: ${item.instruction_text || "Not specified"}\n\nPrescription text:\n${extractedText.substring(0, 4000)}`,
      },
    ];

    const extraction = await provider.callStructuredChat(messages, ScheduleExtractionSchema);

    // Store the extraction as a proposed plan
    const planId = crypto.randomUUID();
    const { error: planError } = await admin.from("medication_plans").insert({
      id: planId,
      user_id: userId,
      portfolio_id: "",
      prescription_item_id: prescriptionItemId,
      document_id: item.document_id,
      display_name: extraction.medicineNameText,
      source_instruction: item.instruction_text || item.dose_text || item.medicine_name || "Prescription",
      plan_type: extraction.routineType,
      status: extraction.confidence >= 0.7 ? "proposed" : "review_required",
      timezone: "Asia/Kolkata",
      start_date: extraction.startDate,
      end_date: extraction.endDate,
      confidence: extraction.confidence,
      requires_review: extraction.requiresConfirmation || extraction.confidence < 0.9,
    });

    if (planError) {
      return { success: false, errorCode: "DATABASE_WRITE_FAILED" };
    }

    // Create schedule rules
    if (extraction.suggestedTimeSlots.length > 0) {
      for (const timeSlot of extraction.suggestedTimeSlots) {
        await admin.from("medication_schedule_rules").insert({
          user_id: userId,
          medication_plan_id: planId,
          rule_type: extraction.routineType === "interval" ? "interval" : "fixed_times",
          local_time: timeSlot,
          interval_hours: extraction.intervalHours,
          source_type: extraction.confidence >= 0.9 ? "prescription" : "system_suggested",
          source_text: item.instruction_text,
          user_confirmed: false,
        });
      }
    }

    return {
      success: true,
      data: {
        planId,
        routineType: extraction.routineType,
        confidence: extraction.confidence,
        suggestedTimeSlots: extraction.suggestedTimeSlots,
        ambiguities: extraction.ambiguities,
        warnings: extraction.warnings,
        requiresConfirmation: extraction.requiresConfirmation,
      },
    };
  } catch {
    return { success: false, errorCode: "AI_EXTRACTION_FAILED" };
  }
}

async function validateSchedule(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const planId = input.planId as string;

  const { data: plan } = await admin
    .from("medication_plans")
    .select("id, user_id, prescription_item_id, plan_type, confidence, requires_review, start_date, end_date, timezone")
    .eq("id", planId)
    .eq("user_id", userId)
    .single();

  if (!plan) return { success: false, errorCode: "ROUTINE_NOT_FOUND" };

  const { data: rules } = await admin
    .from("medication_schedule_rules")
    .select("id, rule_type, local_time, interval_hours, weekdays, source_type, user_confirmed")
    .eq("medication_plan_id", planId);

  const issues: string[] = [];

  if (!rules || rules.length === 0) {
    issues.push("No schedule rules found for this plan.");
  }

  if (!plan.start_date) {
    issues.push("Start date is not specified.");
  }

  if (plan.plan_type === "course_duration" && !plan.end_date && !plan.start_date) {
    issues.push("Both start and end dates are needed for a course duration.");
  }

  if (plan.plan_type === "tapering") {
    issues.push("Tapering schedules require full manual review.");
  }

  const needsReview = issues.length > 0 || plan.requires_review || plan.confidence < 0.8;

  if (needsReview) {
    await admin
      .from("medication_plans")
      .update({ status: "review_required", requires_review: true })
      .eq("id", planId);
  }

  return {
    success: true,
    data: {
      planId,
      isValid: issues.length === 0,
      issues,
      needsReview,
      ruleCount: rules?.length || 0,
    },
  };
}

async function detectRoutineConflicts(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const planId = input.planId as string | undefined;

  // Get all active/paused plans for the user
  const { data: plans } = await admin
    .from("medication_plans")
    .select("id, prescription_item_id, display_name, status, plan_type")
    .eq("user_id", userId)
    .in("status", ["active", "paused", "review_required"]);

  if (!plans || plans.length <= 1) {
    return { success: true, data: { conflicts: [] } };
  }

  // Check for duplicate prescription items
  const conflicts: Array<{ planId: string; conflictingPlanId: string; reason: string }> = [];

  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      if (plans[i].prescription_item_id === plans[j].prescription_item_id) {
        conflicts.push({
          planId: plans[i].id,
          conflictingPlanId: plans[j].id,
          reason: "Two plans reference the same prescription item.",
        });
      }
    }
  }

  return {
    success: true,
    data: { conflicts, planCount: plans.length },
  };
}

async function requestRoutineConfirmation(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const planId = input.planId as string;

  await admin
    .from("medication_plans")
    .update({
      status: "review_required",
      requires_review: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .eq("user_id", userId);

  return {
    success: true,
    data: { planId, status: "review_required" },
  };
}

async function activateRoutine(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const planId = input.planId as string;
  const timezone = input.timezone as string;
  const confirmedTimeSlots = input.confirmedTimeSlots as Array<{ localTime: string; sourceType: string }>;
  const startDate = input.startDate as string | undefined;
  const endDate = input.endDate as string | undefined;

  // Verify plan ownership and status
  const { data: plan } = await admin
    .from("medication_plans")
    .select("id, user_id, prescription_item_id, plan_type, status")
    .eq("id", planId)
    .eq("user_id", userId)
    .single();

  if (!plan) return { success: false, errorCode: "ROUTINE_NOT_FOUND" };

  if (plan.status === "active") {
    return { success: false, errorCode: "ROUTINE_ALREADY_ACTIVE" };
  }

  // Update plan
  await admin
    .from("medication_plans")
    .update({
      status: "active",
      timezone,
      start_date: startDate || new Date().toISOString().split("T")[0],
      end_date: endDate || null,
      requires_review: false,
      activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId);

  // Update schedule rules with confirmed times
  for (const slot of confirmedTimeSlots) {
    await admin.from("medication_schedule_rules").insert({
      user_id: userId,
      medication_plan_id: planId,
      rule_type: "fixed_times",
      local_time: slot.localTime,
      source_type: slot.sourceType as any,
      user_confirmed: slot.sourceType === "user_selected",
    });
  }

  // Generate occurrences
  const { generateOccurrences } = await import("@/lib/routines/scheduler");
  const { data: rules } = await admin
    .from("medication_schedule_rules")
    .select("id, rule_type, local_time, interval_hours, weekdays, start_date, end_date")
    .eq("medication_plan_id", planId);

  let totalOccurrences = 0;
  for (const rule of rules || []) {
    const occurrences = generateOccurrences({
      planId,
      userId,
      ruleId: rule.id,
      ruleType: rule.rule_type as any,
      localTime: rule.local_time || "08:00",
      intervalHours: rule.interval_hours,
      weekdays: rule.weekdays,
      startDate: startDate || rule.start_date,
      endDate: endDate || rule.end_date,
      timezone,
      revisionNumber: 1,
    });

    for (const occ of occurrences) {
      await admin.from("medication_occurrences").insert({
        user_id: userId,
        medication_plan_id: planId,
        schedule_rule_id: rule.id,
        scheduled_for: occ.scheduledFor,
        local_scheduled_time: occ.localScheduledTime,
        timezone,
        status: "scheduled",
        due_window_start: occ.dueWindowStart,
        due_window_end: occ.dueWindowEnd,
        notification_status: "pending",
        generated_from_revision: 1,
        idempotency_key: occ.idempotencyKey,
      }); /* skip duplicates */
      totalOccurrences++;
    }
  }

  // Audit
  await admin.from("audit_events").insert({
    user_id: userId,
    action: "routine_activated",
    resource_type: "medication_plan",
    resource_id: planId,
    metadata: { timezone, occurrenceCount: totalOccurrences },
  });

  return {
    success: true,
    data: { planId, status: "active", occurrencesGenerated: totalOccurrences },
  };
}

async function generateRoutineOccurrences(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const planId = input.planId as string;

  const { data: plan } = await admin
    .from("medication_plans")
    .select("id, user_id, timezone, start_date, end_date, status")
    .eq("id", planId)
    .eq("user_id", userId)
    .single();

  if (!plan) return { success: false, errorCode: "ROUTINE_NOT_FOUND" };
  if (plan.status !== "active") return { success: false, errorCode: "ROUTINE_NOT_ACTIVE" };

  const { generateOccurrences } = await import("@/lib/routines/scheduler");
  const { data: rules } = await admin
    .from("medication_schedule_rules")
    .select("id, rule_type, local_time, interval_hours, weekdays, start_date, end_date")
    .eq("medication_plan_id", planId);

  let generated = 0;
  for (const rule of rules || []) {
    const occurrences = generateOccurrences({
      planId,
      userId,
      ruleId: rule.id,
      ruleType: rule.rule_type as any,
      localTime: rule.local_time || "08:00",
      intervalHours: rule.interval_hours,
      weekdays: rule.weekdays,
      startDate: plan.start_date,
      endDate: plan.end_date,
      timezone: plan.timezone,
      revisionNumber: 1,
    });

    for (const occ of occurrences) {
      await admin.from("medication_occurrences").insert({
        user_id: userId,
        medication_plan_id: planId,
        schedule_rule_id: rule.id,
        scheduled_for: occ.scheduledFor,
        local_scheduled_time: occ.localScheduledTime,
        timezone: plan.timezone,
        status: "scheduled",
        due_window_start: occ.dueWindowStart,
        due_window_end: occ.dueWindowEnd,
        notification_status: "pending",
        generated_from_revision: 1,
        idempotency_key: occ.idempotencyKey,
      }); /* skip duplicates */
      generated++;
    }
  }

  return { success: true, data: { planId, occurrencesGenerated: generated } };
}

async function pauseRoutine(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const planId = input.planId as string;
  const reason = (input.reason as string) || "Paused by user";

  await admin
    .from("medication_plans")
    .update({
      status: "paused",
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .eq("user_id", userId);

  // Invalidate future scheduled occurrences
  await admin
    .from("medication_occurrences")
    .update({ status: "cancelled" })
    .eq("medication_plan_id", planId)
    .in("status", ["scheduled", "due"]);

  return { success: true, data: { planId, status: "paused" } };
}

async function reviseRoutine(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const planId = input.planId as string;
  const revisedTimeSlots = input.revisedTimeSlots as Array<{ localTime: string; sourceType: string }>;
  const reason = input.reason as string;

  // Get current plan state
  const { data: currentPlan } = await admin
    .from("medication_plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", userId)
    .single();

  if (!currentPlan) return { success: false, errorCode: "ROUTINE_NOT_FOUND" };

  // Record revision
  const revisionNumber = (currentPlan as any).revision_number || 1;
  await admin.from("medication_plan_revisions").insert({
    user_id: userId,
    medication_plan_id: planId,
    revision_number: revisionNumber + 1,
    previous_plan: currentPlan,
    revised_plan: { ...currentPlan, schedule_rules: revisedTimeSlots },
    revision_reason: reason,
    actor_type: "user",
  });

  // Invalidate old schedule rules and occurrences
  await admin
    .from("medication_schedule_rules")
    .delete()
    .eq("medication_plan_id", planId);

  await admin
    .from("medication_occurrences")
    .update({ status: "invalidated" })
    .eq("medication_plan_id", planId)
    .in("status", ["scheduled", "due"]);

  // Create new rules
  for (const slot of revisedTimeSlots) {
    await admin.from("medication_schedule_rules").insert({
      user_id: userId,
      medication_plan_id: planId,
      rule_type: "fixed_times",
      local_time: slot.localTime,
      source_type: slot.sourceType as any,
      user_confirmed: slot.sourceType === "user_selected",
    });
  }

  return {
    success: true,
    data: { planId, revisionNumber: revisionNumber + 1 },
  };
}

async function invalidateRoutine(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const planId = input.planId as string;
  const reason = input.reason as string;

  await admin
    .from("medication_plans")
    .update({
      status: "invalidated",
      invalidated_at: new Date().toISOString(),
      invalidation_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .eq("user_id", userId);

  // Cancel all future occurrences
  await admin
    .from("medication_occurrences")
    .update({ status: "cancelled" })
    .eq("medication_plan_id", planId)
    .in("status", ["scheduled", "due", "snoozed"]);

  return { success: true, data: { planId, status: "invalidated" } };
}

async function recordReminderResponse(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const occurrenceId = input.occurrenceId as string;
  const action = input.action as string;
  const clientTimezone = input.clientTimezone as string;
  const clientRequestId = input.clientRequestId as string;
  const reason = input.reason as string | undefined;
  const snoozeMinutes = input.snoozeMinutes as number | undefined;

  // Verify occurrence ownership
  const { data: occurrence } = await admin
    .from("medication_occurrences")
    .select("id, user_id, medication_plan_id, status, scheduled_for")
    .eq("id", occurrenceId)
    .eq("user_id", userId)
    .single();

  if (!occurrence) return { success: false, errorCode: "OCCURRENCE_NOT_FOUND" };

  // Check for duplicate action (idempotency)
  const { data: existingEvent } = await admin
    .from("medication_adherence_events")
    .select("id")
    .eq("client_request_id", clientRequestId)
    .limit(1);

  if (existingEvent?.length) {
    return { success: true, data: { occurrenceId, action, duplicated: true } };
  }

  // Map action to status and event type
  const statusMap: Record<string, { status: string; eventType: string }> = {
    taken: { status: "taken", eventType: "marked_taken" },
    skipped: { status: "skipped", eventType: "marked_skipped" },
    snoozed: { status: "snoozed", eventType: "snoozed" },
    not_now: { status: "scheduled", eventType: "marked_not_now" },
  };

  const mapping = statusMap[action];
  if (!mapping) return { success: false, errorCode: "INVALID_ACTION" };

  // Update occurrence
  const updateData: Record<string, unknown> = {
    status: mapping.status,
    updated_at: new Date().toISOString(),
  };

  // Handle snooze
  if (action === "snoozed" && snoozeMinutes) {
    const { calculateSnoozeTime } = await import("@/lib/routines/scheduler");
    const snoozed = calculateSnoozeTime(occurrence.scheduled_for, snoozeMinutes);
    updateData.due_window_end = snoozed.dueWindowEnd;
  }

  await admin
    .from("medication_occurrences")
    .update(updateData)
    .eq("id", occurrenceId);

  // Record adherence event
  await admin.from("medication_adherence_events").insert({
    user_id: userId,
    medication_plan_id: occurrence.medication_plan_id,
    occurrence_id: occurrenceId,
    event_type: mapping.eventType,
    event_at: new Date().toISOString(),
    client_timezone: clientTimezone,
    optional_reason: reason || null,
    client_request_id: clientRequestId,
  });

  return {
    success: true,
    data: { occurrenceId, action, status: mapping.status },
  };
}

async function completeRoutine(
  input: Record<string, unknown>,
  userId: string,
  admin: AdminClient
): Promise<ToolResult> {
  const planId = input.planId as string;

  await admin
    .from("medication_plans")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .eq("user_id", userId);

  return { success: true, data: { planId, status: "completed" } };
}
