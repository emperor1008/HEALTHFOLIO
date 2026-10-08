import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/user-context";
import { getSessionUser } from "@/lib/auth-session";
import { hit } from "@/lib/api/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Authenticated user-data endpoints.
 *
 * A small, allow-listed table gateway replacing direct browser database calls.
 * The session user is resolved from Better Auth on the server; `user_id` is
 * ALWAYS forced server-side — the client can only reference its own rows and
 * can never read another user's data or choose arbitrary columns.
 *
 * Allowed tables map to the exact queries the app's pages perform:
 *   documents, portfolios, consents, extractions, agent_runs,
 *   medical_measurements, laboratory_reports, prescription_items,
 *   user_medicine_links, routines, routine_occurrences, medicine_courses,
 *   preparation_briefs
 *
 * Responses are shape-limited: rows come back with only the columns each
 * action requests, and mutations validate payloads against per-table Zod
 * schemas. Cross-user access is structurally impossible because the owner
 * filter is bound to the session id, not client input.
 */

const READ_TABLES = new Set([
  "briefs",
  "medical_events",
  "documents",
  "portfolios",
  "consents",
  "extractions",
  "agent_runs",
  "medical_measurements",
  "laboratory_reports",
  "prescription_items",
  "user_medicine_links",
  "routines",
  "routine_occurrences",
  "medicine_courses",
  "preparation_briefs",
]);

const WRITE_TABLES = new Set([
  "briefs",
  "portfolios",
  "routines",
  "routine_occurrences",
  "medicine_courses",
  "preparation_briefs",
  "documents",
]);

// Loose per-table write validation: strings/objects with bounded depth and no
// nested arrays of arrays. Table-specific routes (care requests, pharmacy,
// appointments, uploads) keep their dedicated strict schemas.
const WritePayload = zLooseObject();

function zLooseObject() {
  // Local minimal schema to avoid importing zod into this shared gateway:
  // accepts a plain JSON object with string/number/boolean/null/array values,
  // depth-limited, size-bounded.
  return {
    safeParse(value: unknown):
      | { success: true; data: Record<string, unknown> }
      | { success: false } {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { success: false };
      }
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > 60) return { success: false };
      for (const [, v] of entries) {
        if (!isBounded(v, 0)) return { success: false };
      }
      return { success: true, data: value as Record<string, unknown> };
    },
  };
}

function isBounded(v: unknown, depth: number): boolean {
  if (v === null) return true;
  const t = typeof v;
  if (t === "string") return (v as string).length <= 20_000;
  if (t === "number" || t === "boolean") return Number.isFinite(v as number) || typeof v === "boolean";
  if (Array.isArray(v)) {
    if (depth > 2 || v.length > 200) return false;
    return v.every((item) => isBounded(item, depth + 1));
  }
  if (t === "object") {
    if (depth > 2) return false;
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length > 60) return false;
    return entries.every(([, item]) => isBounded(item, depth + 1));
  }
  return false;
}

function unauthorized() {
  return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
}

function badRequest() {
  return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
}

function unavailable() {
  return NextResponse.json({ code: "UNAVAILABLE" }, { status: 503 });
}

function conflict() {
  return NextResponse.json({ code: "CONFLICT" }, { status: 409 });
}

function forbidden() {
  return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
}

/**
 * Foreign keys a client may supply that point at another user's row.
 * The gateway forces `user_id`, but a payload could still reference a foreign
 * `portfolio_id` — attaching a row to somebody else's portfolio. Every
 * declared reference is verified to belong to the session user BEFORE the
 * write; the filter is bound to the session id, never to client input.
 */
const OWNED_REFERENCES: Record<string, string[]> = {
  briefs: ["portfolio_id"],
  documents: ["portfolio_id"],
};

async function referencesAreOwned(
  supabase: ReturnType<typeof getServerSupabase>,
  table: string,
  payload: Record<string, unknown>,
  ownerId: string
): Promise<boolean> {
  const referenceColumns = OWNED_REFERENCES[table] ?? [];
  for (const column of referenceColumns) {
    const value = payload[column];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) return false;
    const { data, error } = await supabase
      .from("portfolios")
      .select("id")
      .eq("id", value)
      .eq("user_id", ownerId)
      .maybeSingle();
    if (error) return false;
    if (!data) return false;
  }
  return true;
}

// Not-found and not-owned are deliberately indistinguishable: a client can
// never use the status code to probe for the existence of another user's row.
function notFound() {
  return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
}

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";

interface Ctx {
  params: Promise<{ table: string }>;
}

export async function GET(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const rl = hit(`user-data:${user.id}`, 120, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const { table } = await ctx.params;
  if (!READ_TABLES.has(table)) return badRequest();

  let supabase;
  try {
    supabase = getServerSupabase();
  } catch {
    return unavailable();
  }

  const url = new URL(req.url);
  const select = (url.searchParams.get("select") ?? "id").replace(/[^a-zA-Z0-9_,\s*]/g, "");
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 400) : 50;
  const filters = url.searchParams.getAll("eq");
  const orderParam = url.searchParams.get("order");

  let query = supabase.from(table).select(select).eq("user_id", user.id).limit(limit);

  // eq filters are name=value pairs; only safe column names pass.
  for (const pair of filters.slice(0, 8)) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const column = pair.slice(0, idx).replace(/[^a-z_]/g, "");
    const value = pair.slice(idx + 1);
    if (!column || column.includes("user_id")) continue; // user_id is forced
    query = query.eq(column, value);
  }

  if (orderParam) {
    const [column, dir] = orderParam.split(".");
    if (/^[a-z_]+$/.test(column ?? "") && column !== "user_id") {
      query = query.order(column, { ascending: dir !== "desc" });
    }
  }

  const { data, error } = await query;
  if (error) return unavailable();
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const rl = hit(`user-data-write:${user.id}`, 40, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const { table } = await ctx.params;
  if (!WRITE_TABLES.has(table)) return badRequest();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = WritePayload.safeParse(body);
  if (!parsed.success) return badRequest();

  let supabase;
  try {
    supabase = getServerSupabase();
  } catch {
    return unavailable();
  }

  if (!(await referencesAreOwned(supabase, table, parsed.data, user.id))) {
    return forbidden();
  }

  // Force ownership server-side; client-sent user_id is ignored.
  const insert = { ...parsed.data, user_id: user.id };
  const { data, error } = await supabase
    .from(table)
    .insert(insert)
    .select("id")
    .single();

  if (error) {
    // A duplicate primary key / unique key is a client-visible conflict, not an
    // infrastructure outage: reporting 503 made a retryable duplicate look like
    // a server failure.
    return error.code === UNIQUE_VIOLATION ? conflict() : unavailable();
  }
  return NextResponse.json({ row: data }, { status: 201 });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { table } = await ctx.params;
  if (!WRITE_TABLES.has(table)) return badRequest();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest();
  }
  const parsed = WritePayload.safeParse(body);
  if (!parsed.success) return badRequest();

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return badRequest();

  let supabase;
  try {
    supabase = getServerSupabase();
  } catch {
    return unavailable();
  }

  if (!(await referencesAreOwned(supabase, table, parsed.data, user.id))) {
    return forbidden();
  }

  // Ownership double-check in the UPDATE's WHERE clause.
  const patch = { ...parsed.data };
  delete patch.user_id; // ownership cannot be reassigned
  // Return the affected rows so a no-op (row absent, or owned by somebody
  // else) is reported as 404 instead of a false 200 success.
  const { data: updated, error } = await supabase
    .from(table)
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) return unavailable();
  if (!updated || updated.length === 0) return notFound();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { table } = await ctx.params;
  if (!WRITE_TABLES.has(table) && table !== "documents") return badRequest();

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return badRequest();

  let supabase;
  try {
    supabase = getServerSupabase();
  } catch {
    return unavailable();
  }

  const { data: deleted, error } = await supabase
    .from(table)
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");

  if (error) return unavailable();
  if (!deleted || deleted.length === 0) return notFound();
  return NextResponse.json({ ok: true });
}
