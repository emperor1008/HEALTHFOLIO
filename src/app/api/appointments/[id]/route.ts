import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth-helpers";
import { z } from "zod";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

const updateAppointmentSchema = z.object({
  startsAt: z.string().optional(),
  timezone: z.string().optional(),
  specialty: z.string().optional(),
  clinicianName: z.string().optional(),
  location: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId();

  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        formatErrorResponse(
          createError("AUTH_REQUIRED", "Authentication required"),
          requestId
        ),
        { status: 401 }
      );
    }

    const supabase = createClient();
    const appointmentId = params.id;
    const body = await request.json();
    const parsed = updateAppointmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        formatErrorResponse(
          createError("INVALID_REQUEST", "Invalid appointment data"),
          requestId
        ),
        { status: 400 }
      );
    }

    // Verify appointment ownership
    const { data: appointment, error: fetchError } = await supabase
      .from("care_appointments")
      .select("id, starts_at, user_id")
      .eq("id", appointmentId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !appointment) {
      return NextResponse.json(
        formatErrorResponse(
          createError("NOT_FOUND", "Appointment not found."),
          requestId
        ),
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.startsAt) updates.starts_at = parsed.data.startsAt;
    if (parsed.data.timezone) updates.timezone = parsed.data.timezone;
    if (parsed.data.specialty !== undefined) updates.specialty = parsed.data.specialty;
    if (parsed.data.clinicianName !== undefined) updates.clinician_name = parsed.data.clinicianName;
    if (parsed.data.location !== undefined) updates.location = parsed.data.location;

    // Check if date actually changed
    const dateChanged =
      parsed.data.startsAt &&
      parsed.data.startsAt !== appointment.starts_at;

    // Update appointment
    const { error: updateError } = await supabase
      .from("care_appointments")
      .update(updates)
      .eq("id", appointmentId);

    if (updateError) {
      return NextResponse.json(
        formatErrorResponse(
          createError("INTERNAL_ERROR", "Could not update appointment"),
          requestId
        ),
        { status: 500 }
      );
    }

    let adaptedItems: string[] = [];

    if (dateChanged) {
      // Mark briefs as stale
      const { data: portfolio } = await supabase
        .from("portfolios")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (portfolio) {
        await supabase
          .from("briefs")
          .update({ status: "stale" })
          .eq("portfolio_id", portfolio.id)
          .eq("user_id", user.id)
          .eq("appointment_id", appointmentId)
          .in("status", ["approved", "draft"]);

        adaptedItems.push("brief");

        // Cancel existing scheduled reminders
        await supabase
          .from("reminders")
          .update({ status: "cancelled" })
          .eq("appointment_id", appointmentId)
          .eq("user_id", user.id)
          .eq("status", "scheduled");

        adaptedItems.push("reminder");
        adaptedItems.push("calendar");
      }
    }

    // Audit
    await supabase.from("audit_events").insert({
      user_id: user.id,
      action: "appointment_updated",
      resource_type: "appointment",
      resource_id: appointmentId,
      metadata: {
        dateChanged: !!dateChanged,
        adaptedItems,
      },
    });

    return NextResponse.json({
      data: {
        appointmentId,
        dateChanged: !!dateChanged,
        adaptedItems,
        message: dateChanged
          ? `Appointment updated. Dependent items marked for regeneration: ${adaptedItems.join(", ")}.`
          : "Appointment updated.",
      },
      error: null,
      requestId,
    });
  } catch {
    return NextResponse.json(
      formatErrorResponse(
        createError("INTERNAL_ERROR", "Something went wrong"),
        requestId
      ),
      { status: 500 }
    );
  }
}
