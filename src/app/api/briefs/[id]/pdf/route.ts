import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";
import type { BriefContent } from "@/lib/ai/schemas";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId();

  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
        { status: 401 }
      );
    }

    const briefId = params.id;
    const admin = createAdminClient();

    // Verify brief ownership
    const { data: brief, error: briefError } = await admin
      .from("briefs")
      .select("*")
      .eq("id", briefId)
      .eq("user_id", user.id)
      .single();

    if (briefError || !brief) {
      return NextResponse.json(
        formatErrorResponse(createError("NOT_FOUND", "Brief not found."), requestId),
        { status: 404 }
      );
    }

    if (brief.status !== "approved" && brief.status !== "draft") {
      return NextResponse.json(
        formatErrorResponse(
          createError("INVALID_REQUEST", "Brief must be approved before PDF export."),
          requestId
        ),
        { status: 400 }
      );
    }

    const content = brief.content as BriefContent;

    // Generate PDF
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let y = margin;

    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Healthfolio Consultation Brief", margin, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(95, 107, 118); // secondary text
    doc.text(`Generated: ${new Date(content.generatedAt).toLocaleDateString("en-IN")}`, margin, y);
    y += 10;

    // Divider
    doc.setDrawColor(217, 222, 227);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Appointment Details
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(31, 41, 51);
    doc.text("Appointment Details", margin, y);
    y += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const appt = content.appointmentDetails;
    if (appt.date) {
      doc.text(`Date: ${appt.date}`, margin, y);
      y += 5;
    }
    if (appt.time) {
      doc.text(`Time: ${appt.time} (${appt.timezone})`, margin, y);
      y += 5;
    }
    if (appt.specialty) {
      doc.text(`Specialty: ${appt.specialty}`, margin, y);
      y += 5;
    }
    if (appt.clinicianName) {
      doc.text(`Clinician: ${appt.clinicianName}`, margin, y);
      y += 5;
    }
    if (appt.location) {
      doc.text(`Location: ${appt.location}`, margin, y);
      y += 5;
    }
    y += 5;

    // Goal
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Preparation Goal", margin, y);
    y += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const goalLines = doc.splitTextToSize(content.goal, contentWidth);
    doc.text(goalLines, margin, y);
    y += goalLines.length * 5 + 5;

    // Verified Events
    if (content.verifiedEvents.length > 0) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Verified Timeline", margin, y);
      y += 7;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      for (const event of content.verifiedEvents) {
        if (y > 260) {
          doc.addPage();
          y = margin;
        }
        doc.setFont("helvetica", "bold");
        doc.text(`${event.date || "Date unknown"} — ${event.title.substring(0, 80)}`, margin, y);
        y += 5;
        doc.setFont("helvetica", "normal");
        const descLines = doc.splitTextToSize(event.description, contentWidth - 5);
        doc.text(descLines, margin + 5, y);
        y += descLines.length * 4 + 3;
      }
      y += 5;
    }

    // Questions
    if (content.questionsToDiscuss.length > 0) {
      if (y > 240) {
        doc.addPage();
        y = margin;
      }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Questions to Discuss", margin, y);
      y += 7;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      for (const q of content.questionsToDiscuss) {
        if (y > 270) {
          doc.addPage();
          y = margin;
        }
        const qLines = doc.splitTextToSize(`• ${q}`, contentWidth);
        doc.text(qLines, margin, y);
        y += qLines.length * 4 + 2;
      }
      y += 5;
    }

    // Checklist
    if (content.preparationChecklist.length > 0) {
      if (y > 240) {
        doc.addPage();
        y = margin;
      }
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Preparation Checklist", margin, y);
      y += 7;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      for (const item of content.preparationChecklist) {
        if (y > 270) {
          doc.addPage();
          y = margin;
        }
        doc.text(`☐  ${item}`, margin, y);
        y += 5;
      }
      y += 5;
    }

    // Safety Disclaimer
    if (y > 250) {
      doc.addPage();
      y = margin;
    }
    doc.setDrawColor(217, 222, 227);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(95, 107, 118);
    const disclaimerLines = doc.splitTextToSize(content.safetyDisclaimer, contentWidth);
    doc.text(disclaimerLines, margin, y);

    // Generate PDF buffer
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    // Audit
    await admin.from("audit_events").insert({
      user_id: user.id,
      action: "export",
      resource_type: "brief",
      resource_id: briefId,
    });

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="healthfolio-brief-${briefId.substring(0, 8)}.pdf"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      formatErrorResponse(createError("EXPORT_FAILED", "PDF export failed. Your brief is saved."), requestId),
      { status: 500 }
    );
  }
}
