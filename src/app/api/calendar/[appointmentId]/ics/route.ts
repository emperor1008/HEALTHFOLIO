import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";
import { createEvents } from "ics";

export async function GET(
  request: NextRequest,
  { params }: { params: { appointmentId: string } }
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

    const appointmentId = params.appointmentId;
    const admin = createAdminClient();

    // Verify appointment ownership
    const { data: appointment, error: apptError } = await admin
      .from("appointments")
      .select("*")
      .eq("id", appointmentId)
      .eq("user_id", user.id)
      .single();

    if (apptError || !appointment) {
      return NextResponse.json(
        formatErrorResponse(createError("NOT_FOUND", "Appointment not found."), requestId),
        { status: 404 }
      );
    }

    // Parse appointment date
    const apptDate = new Date(appointment.starts_at);
    const year = apptDate.getFullYear();
    const month = apptDate.getMonth() + 1;
    const day = apptDate.getDate();
    const hours = apptDate.getHours();
    const minutes = apptDate.getMinutes();

    // End time: 1 hour after start
    const endHours = hours + 1;

    const eventTitle = appointment.specialty
      ? `Healthfolio: ${appointment.specialty} Appointment`
      : "Healthfolio: Medical Appointment";

    const descriptionParts = [
      "Healthfolio consultation preparation",
      "",
      `Prepared with Healthfolio — ${process.env.NEXT_PUBLIC_APP_URL || "https://healthfolio.app"}`,
      "",
      "Healthfolio organizes medical information and helps you prepare for consultations.",
      "It does not diagnose conditions, recommend treatment, or replace a healthcare professional.",
    ];

    if (appointment.clinician_name) {
      descriptionParts.unshift(`Clinician: ${appointment.clinician_name}`);
    }

    const { value, error } = createEvents([
      {
        start: [year, month, day, hours, minutes],
        end: [year, month, day, endHours, minutes],
        title: eventTitle,
        description: descriptionParts.join("\\n"),
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
      return NextResponse.json(
        formatErrorResponse(createError("EXPORT_FAILED", "Calendar file generation failed."), requestId),
        { status: 500 }
      );
    }

    // Audit
    await admin.from("audit_events").insert({
      user_id: user.id,
      action: "export",
      resource_type: "calendar",
      resource_id: appointmentId,
    });

    return new NextResponse(value, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="healthfolio-appointment.ics"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      formatErrorResponse(createError("EXPORT_FAILED", "Calendar export failed."), requestId),
      { status: 500 }
    );
  }
}
