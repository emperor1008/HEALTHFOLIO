import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth-helpers";
import { generateRequestId, createError, formatErrorResponse } from "@/lib/errors";

const CURRENT_CONSENT_VERSION = "1.0";

/**
 * GET /api/consent/status
 * Returns whether the user has accepted the current version of all required consents.
 */
export async function GET() {
  const requestId = generateRequestId();

  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
        { status: 401 }
      );
    }

    const supabase = createClient();

    const { data: consents } = await supabase
      .from("consents")
      .select("consent_type, policy_version, revoked_at")
      .eq("user_id", user.id);

    const requiredTypes = ["terms", "privacy", "ai_processing"];

    const hasConsent = requiredTypes.every((type) => {
      const consent = consents?.find((c) => c.consent_type === type);
      return (
        consent &&
        consent.policy_version === CURRENT_CONSENT_VERSION &&
        !consent.revoked_at
      );
    });

    return NextResponse.json({
      data: { hasConsent, currentVersion: CURRENT_CONSENT_VERSION },
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
