import { NextResponse } from "next/server";
import { z } from "zod";
import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { readSessionCookie } from "@/lib/firebase/session-cookie";
import { getAdminAuth } from "@/lib/firebase/admin";
import { provisionIdentity } from "@/lib/firebase/provision";
import { hit } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

const ProvisionSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  dob: z.string().trim().max(32).optional(),
  gender: z.enum(["female", "male", "other"]).optional(),
  region: z.string().trim().max(160).optional(),
  consent: z.literal(true).optional(),
});

/**
 * Idempotent identity provisioning for the signed-in user — creates or
 * repairs `users/{uid}` + the P1-TEMP Postgres bridge.
 *
 * Called automatically after sign-in (fire-and-forget) and used by any flow
 * that needs the identity state present. Verified by SESSION COOKIE only
 * (register provisions inline before the client ever gets a cookie).
 * Profile fields are optional: a sign-in ensure sends `{}`.
 */
export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = hit(`auth-provision:${ip}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ code: "SERVER_NOT_CONFIGURED" }, { status: 503 });
  }

  let token: string | null = null;
  try {
    token = readSessionCookie(req.headers.get("cookie"));
  } catch {
    token = null;
  }
  if (!token) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(token);
    if (!decoded.uid) throw new Error("missing uid");
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }
  const parsed = ProvisionSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_BODY" }, { status: 400 });
  }

  try {
    await provisionIdentity(uid, parsed.data);
    return NextResponse.json({ data: { ok: true }, error: null });
  } catch {
    return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
