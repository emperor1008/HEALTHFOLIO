import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/auth-session";
import { hit } from "@/lib/api/rate-limit";
import { DoctorApplicationSchema } from "@/lib/auth/schemas";

export const dynamic = "force-dynamic";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Submit a doctor application.
 *
 * Security:
 * - Requires a valid Better Auth session (must be signed in first).
 * - Role creation is limited to `doctor_pending` — never `doctor`.
 * - Zod validation; rate limited per user; licence number is stored but only
 *   ever surfaced to authorized administrators (RLS: no policies).
 * - Writes a redacted role_policy_events row.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const rl = hit(`doctor-apply:${user.id}`, 3, 600);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = DoctorApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ code: "SERVER_NOT_CONFIGURED" }, { status: 503 });
  }

  const data = parsed.data;

  // One application per user: upsert keeps the honest single-record invariant.
  const { error: upsertError } = await supabase
    .from("doctor_applications")
    .upsert(
      {
        user_id: user.id,
        licence_number: data.licenceNumber,
        specialty: data.specialty,
        facility_name: data.facilityName,
        region: data.region,
        status: "received" as const,
      },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    // Never echo database internals.
    return NextResponse.json({ code: "SUBMISSION_FAILED" }, { status: 500 });
  }

  await supabase
    .from("app_roles")
    .upsert(
      { user_id: user.id, role: "doctor_pending", status: "active" },
      { onConflict: "user_id,role" }
    );

  await supabase.from("role_policy_events").insert({
    event: "doctor_application_submitted",
    role: "doctor_pending",
    actor_user_id: user.id,
    target_user_id: user.id,
    // Redacted metadata only.
    metadata: { specialty: data.specialty },
  });

  return NextResponse.json({ status: "received" }, { status: 201 });
}
