/**
 * /api/health-card — the Offline Health Card source endpoint (Phase 2).
 *
 * GET   → builds the typed OfflineHealthCard for the SESSION user only:
 *         profile (name + preferred language), explicitly recorded
 *         allergies/conditions, active medicines, recent care summary.
 * PATCH → updates the patient's explicitly recorded facts (allergies,
 *         conditions) and returns the rebuilt card.
 *
 * Security:
 *   - Better Auth session required (401 otherwise).
 *   - Every query is scoped to `user_id = session user`; there is no input
 *     that can address another patient (ownership is not client-selectable).
 *   - RLS stays enabled (default-deny) — the route uses the service-role
 *     client, exactly like the rest of the API layer.
 *   - Response passes the shared Zod schema before it is sent, so a card
 *     shape can never drift silently.
 *   - No records/documents/identifiers beyond the session user's own
 *     minimal snapshot; errors are machine-readable, never stack traces.
 *
 * If the facts table (migration 029) has not been applied yet, GET still
 * succeeds with empty facts (honest "not recorded"), and PATCH returns a
 * structured CONFIGURATION_ERROR instead of pretending to save.
 */
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createError, formatErrorResponse, generateRequestId } from "@/lib/errors";
import { resolveLanguage, isLanguage } from "@/lib/i18n";
import {
  HEALTH_CARD_SCHEMA_VERSION,
  HealthCardFactsSchema,
  OfflineHealthCardSchema,
  type OfflineHealthCard,
  type RecentCareItem,
} from "@/lib/health-card/model";

export const dynamic = "force-dynamic";

const MAX_RECENT_CARE = 5;
const MAX_MEDICATIONS = 40;

interface ProfileRow {
  display_name: string | null;
  locale: string | null;
}

interface MedicationRow {
  display_name: string;
  updated_at?: string;
}

interface FactsRow {
  allergies: string[];
  conditions: string[];
  updated_at: string;
}

interface CareRow {
  id: string;
  status: string;
  triage_category: string | null;
  summary: string | null;
  reason: string | null;
  created_at: string;
}

function snippet(value: string | null, max: number): string {
  if (!value) return "";
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

/** Build the card for one user. Exported for tests. */
export async function buildHealthCard(userId: string): Promise<{
  card: OfflineHealthCard;
  factsAvailable: boolean;
}> {
  const admin = await createAdminClient();

  const [profileResult, medsResult, factsResult, careResult] = await Promise.all([
    admin
      .from("profiles")
      .select("display_name, locale")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("medication_plans")
      .select("display_name, updated_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(MAX_MEDICATIONS),
    admin.from("health_card_facts").select("allergies, conditions, updated_at").eq("user_id", userId).maybeSingle(),
    admin
      .from("care_requests")
      .select("id, status, triage_category, summary, reason, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_RECENT_CARE),
  ]);

  const profile = (profileResult.data as ProfileRow | null) ?? null;
  const meds = ((medsResult.data as MedicationRow[] | null) ?? []).filter(
    (m) => typeof m.display_name === "string" && m.display_name.trim().length > 0
  );

  // The facts table may not exist yet (migration 029 not applied): degrade
  // honestly to "not recorded" instead of failing the whole card.
  const factsError = Boolean(factsResult.error);
  const facts = factsError ? null : (factsResult.data as FactsRow | null);
  const allergies = facts && Array.isArray(facts.allergies) ? facts.allergies.slice(0, 50) : [];
  const conditions = facts && Array.isArray(facts.conditions) ? facts.conditions.slice(0, 50) : [];

  const careRows = (careResult.data as CareRow[] | null) ?? [];
  const recentCare: RecentCareItem[] = careRows.map((row) => ({
    id: row.id,
    date: isoOrNull(row.created_at) ? String(row.created_at).slice(0, 10) : null,
    kind: "care_request",
    status: row.status,
    label: snippet(row.summary || row.reason, 160),
  }));

  const rawLanguage = profile?.locale ?? "";
  const baseLanguage = rawLanguage.split("-")[0] ?? "";
  const preferredLanguage = isLanguage(baseLanguage) ? resolveLanguage(baseLanguage) : "en";

  // Content version = newest source timestamp actually used (deterministic
  // for a given data state) — lets the client detect "no change yet".
  const sourceTimestamps: number[] = [];
  for (const ts of [
    facts?.updated_at,
    ...meds.map((m) => m.updated_at),
    ...careRows.map((r) => r.created_at),
  ]) {
    const parsed = typeof ts === "string" ? Date.parse(ts) : NaN;
    if (Number.isFinite(parsed)) sourceTimestamps.push(parsed);
  }
  const fetchedAt = new Date();
  const version = sourceTimestamps.length > 0
    ? new Date(Math.max(...sourceTimestamps)).toISOString()
    : fetchedAt.toISOString();

  const card: OfflineHealthCard = {
    schemaVersion: HEALTH_CARD_SCHEMA_VERSION,
    version,
    updatedAt: fetchedAt.toISOString(),
    profile: {
      displayName: profile?.display_name ? snippet(profile.display_name, 160) || null : null,
      preferredLanguage,
    },
    allergies: allergies.slice(0, 50),
    conditions: conditions.slice(0, 50),
    medications: meds.map((m) => snippet(m.display_name, 160)).filter((name) => name.length > 0),
    recentCare,
  };

  // Defense in depth: never respond with a shape the client cannot parse.
  const parsed = OfflineHealthCardSchema.safeParse(card);
  if (!parsed.success) {
    throw new Error("HEALTH_CARD_SHAPE_INVALID");
  }
  return { card: parsed.data, factsAvailable: !factsError };
}

export async function GET() {
  const requestId = generateRequestId();
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
      { status: 401 }
    );
  }

  try {
    const { card } = await buildHealthCard(user.id);
    return NextResponse.json({ data: { card }, error: null, requestId });
  } catch {
    return NextResponse.json(
      formatErrorResponse(createError("INTERNAL_ERROR", "Could not load your health card"), requestId),
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const requestId = generateRequestId();
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      formatErrorResponse(createError("AUTH_REQUIRED", "Authentication required"), requestId),
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      formatErrorResponse(createError("INVALID_REQUEST", "Invalid request body"), requestId),
      { status: 400 }
    );
  }

  const parsedBody = HealthCardFactsSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      formatErrorResponse(createError("INVALID_REQUEST", "Invalid health facts"), requestId),
      { status: 400 }
    );
  }

  const admin = await createAdminClient();
  const { error } = await admin.from("health_card_facts").upsert({
    user_id: user.id,
    allergies: parsedBody.data.allergies,
    conditions: parsedBody.data.conditions,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    // Most common cause: migration 029 not applied yet. Be explicit.
    return NextResponse.json(
      formatErrorResponse(
        createError(
          "CONFIGURATION_ERROR",
          "Health card storage is not available yet on this deployment"
        ),
        requestId
      ),
      { status: 503 }
    );
  }

  try {
    const { card } = await buildHealthCard(user.id);
    return NextResponse.json({ data: { card }, error: null, requestId });
  } catch {
    return NextResponse.json(
      formatErrorResponse(createError("INTERNAL_ERROR", "Could not reload your health card"), requestId),
      { status: 500 }
    );
  }
}
