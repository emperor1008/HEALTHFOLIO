import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { z } from "zod";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

const consentSchema = z.object({
  consents: z.array(
    z.object({
      consentType: z.enum(["terms", "privacy", "ai_processing"]),
      policyVersion: z.string().min(1),
    })
  ),
});

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = consentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        formatErrorResponse(createError("INVALID_REQUEST", "Invalid consent data"), requestId),
        { status: 400 }
      );
    }

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = await createAdminClient();

    // Record each consent
    const consentRecords = parsed.data.consents.map((c) => ({
      user_id: user.id,
      consent_type: c.consentType,
      policy_version: c.policyVersion,
      granted_at: new Date().toISOString(),
    }));

    const { error: insertError } = await admin
      .from("consents")
      .upsert(consentRecords, {
        onConflict: "user_id,consent_type",
      });

    if (insertError) {
      return NextResponse.json(
        formatErrorResponse(createError("INTERNAL_ERROR", "Could not save consent"), requestId),
        { status: 500 }
      );
    }

    // Audit the consent event
    await admin.from("audit_events").insert({
      user_id: user.id,
      action: "consent_granted",
      resource_type: "consent",
      metadata: { consentTypes: parsed.data.consents.map((c) => c.consentType) },
    });

    return NextResponse.json({
      data: { success: true },
      error: null,
      requestId,
    });
  } catch {
    return NextResponse.json(
      formatErrorResponse(createError("INTERNAL_ERROR", "Something went wrong"), requestId),
      { status: 500 }
    );
  }
}
