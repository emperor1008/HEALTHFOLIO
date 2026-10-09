/**
 * Phase 6 integration harness — application layer.
 *
 * Route handlers under test import three seams:
 *   - `@/lib/auth-session`      → who the request is (Better Auth session)
 *   - `@/lib/auth-helpers`      → `getUser()`
 *   - `@/lib/supabase/*`        → the database client
 *
 * Each integration test file declares the four `vi.mock` calls below at module
 * scope (vitest requires the calls to live in the test file so its hoisting
 * transform can see them), then drives the REAL route handlers against the
 * REAL database from `pg-harness.ts`:
 *
 *   vi.mock("@/lib/auth-session", () => ({
 *     getSessionUser: async () => appState.identity,
 *     getActiveRoles: async () => appState.roles,
 *   }));
 *   vi.mock("@/lib/auth-helpers", () => ({
 *     getUser: async () => appState.identity,
 *   }));
 *   vi.mock("@/lib/supabase/user-context", () => ({
 *     getServerSupabase: () => appState.client,
 *   }));
 *   vi.mock("@/lib/supabase/admin", () => ({
 *     createAdminClient: async () => appState.client,
 *   }));
 *
 * Role resolution (`getStaffIdentity`, `getPharmacyMemberships`, `isPlatformAdmin`)
 * is deliberately NOT mocked: those helpers query real
 * `facility_memberships` / `user_roles` / `pharmacy_memberships` rows created by
 * the fixtures, so every authorization decision in the tests is made from
 * database state exactly as in production.
 */
import { NextRequest } from "next/server";
import { createHealthfolioDb, type HealthfolioDb } from "./pg-harness";
import { createSupabaseShim, type SupabaseShim } from "./postgrest-shim";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface AppState {
  db: HealthfolioDb;
  client: SupabaseShim;
  identity: SessionUser | null;
  roles: string[];
}

/** Mutable harness state shared with the per-file `vi.mock` factories. */
export const appState: Partial<AppState> & { identity: SessionUser | null; roles: string[] } = {
  identity: null,
  roles: [],
};

export function db(): HealthfolioDb {
  if (!appState.db) throw new Error("harness: call setupHarness() in beforeAll first");
  return appState.db;
}

export function client(): SupabaseShim {
  if (!appState.client) throw new Error("harness: call setupHarness() in beforeAll first");
  return appState.client;
}

/** Boot the database and install the shim client as the app's connection. */
export async function setupHarness(): Promise<AppState> {
  const database = await createHealthfolioDb({ quiet: true });
  const shim = createSupabaseShim(database.sql);
  appState.db = database;
  appState.client = shim;
  appState.identity = null;
  appState.roles = [];
  // The application's server connection always uses the service-role key.
  await database.asRole("service_role");
  return appState as AppState;
}

export async function teardownHarness(): Promise<void> {
  await appState.db?.close();
  appState.identity = null;
  appState.roles = [];
}

/** Act as a signed-in user (or nobody, when passed null). */
export async function actAs(user: SessionUser | null, roles: string[] = []): Promise<void> {
  appState.identity = user;
  appState.roles = roles;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const { rows } = await db().sql.query<T>(sql, params);
  return rows;
}

export async function one<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export function countOf(sql: string, params: unknown[] = []): Promise<number> {
  return one<{ count: number }>(sql, params).then((r) => r?.count ?? 0);
}

// ── identity fixtures ─────────────────────────────────────────────────────

export interface UserFixture extends SessionUser {
  userId: string;
}

/**
 * Create one synthetic identity. Rows are written to BOTH identity stores:
 * `auth.users` (the shim's GoTrue table, referenced by every medical table's
 * foreign keys) and `"user"` (the Better Auth canonical table, referenced by
 * `app_roles`). Same UUID in both, exactly as the real migration history
 * intends.
 */
export async function seedUser(email: string, name: string): Promise<UserFixture> {
  const [authUser] = await query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email]
  );
  await query('insert into "user" (id, name, email) values ($1, $2, $3)', [
    authUser.id,
    name,
    email,
  ]);
  return { id: authUser.id, userId: authUser.id, email, name };
}

export async function grantAppRole(
  userId: string,
  role: "patient" | "doctor_pending" | "doctor" | "facility_admin" | "platform_admin",
  status: "active" | "suspended" | "revoked" = "active"
): Promise<void> {
  await query(
    "insert into app_roles (user_id, role, status) values ($1, $2, $3) on conflict do nothing",
    [userId, role, status]
  );
}

export async function seedPatient(email = "patient@example.test"): Promise<UserFixture> {
  const user = await seedUser(email, "Test Patient");
  await grantAppRole(user.userId, "patient");
  return user;
}

export async function seedFacility(name = "Care Hub Facility"): Promise<string> {
  const rows = await query<{ id: string }>(
    "insert into facilities (name) values ($1) returning id",
    [name]
  );
  return rows[0].id;
}

export async function grantPlatformRole(
  userId: string,
  role:
    | "patient"
    | "clinician"
    | "pharmacy_operator"
    | "facility_coordinator"
    | "pharmacy_manager"
    | "platform_admin",
  status: "active" | "suspended" | "revoked" = "active",
  scopeId: string | null = null
): Promise<void> {
  await query(
    "insert into user_roles (user_id, role, status, scope_id) values ($1, $2, $3, $4)",
    [userId, role, status, scopeId]
  );
}

export async function addFacilityMembership(
  userId: string,
  facilityId: string,
  role: "clinician" | "coordinator"
): Promise<void> {
  await query(
    "insert into facility_memberships (user_id, facility_id, role) values ($1, $2, $3)",
    [userId, facilityId, role]
  );
}

export interface ClinicianFixture extends UserFixture {
  profileId: string;
  facilityId: string;
}

/**
 * A fully provisioned clinician: Better Auth user, facility membership, an
 * ACTIVE `user_roles` registry row, and a clinician profile. This is the exact
 * shape `getStaffIdentity` + `getStaffIdentity`-gated routes require, so the
 * tests exercise the real provisioning contract.
 */
export async function seedClinician(options: {
  email: string;
  facilityId: string;
  displayName?: string;
  availability?: "available" | "busy" | "offline";
  specialty?: string;
}): Promise<ClinicianFixture> {
  const user = await seedUser(options.email, options.displayName ?? "Test Clinician");
  await grantAppRole(user.userId, "doctor");
  await addFacilityMembership(user.userId, options.facilityId, "clinician");
  await grantPlatformRole(user.userId, "clinician", "active", options.facilityId);
  const rows = await query<{ id: string }>(
    `insert into clinician_profiles (user_id, display_name, facility_id, specialty, availability_state)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      user.userId,
      options.displayName ?? "Test Clinician",
      options.facilityId,
      options.specialty ?? "general",
      options.availability ?? "available",
    ]
  );
  return { ...user, profileId: rows[0].id, facilityId: options.facilityId };
}

export async function seedCoordinator(
  email: string,
  facilityId: string
): Promise<UserFixture & { facilityId: string }> {
  const user = await seedUser(email, "Care Hub Coordinator");
  await grantAppRole(user.userId, "facility_admin");
  await addFacilityMembership(user.userId, facilityId, "coordinator");
  await grantPlatformRole(user.userId, "facility_coordinator", "active", facilityId);
  return { ...user, facilityId };
}

export async function seedPharmacy(
  name = "Test Pharmacy",
  verificationState: "pending" | "verified" | "suspended" = "verified"
): Promise<string> {
  const rows = await query<{ id: string }>(
    "insert into pharmacies (name, verification_state, is_open) values ($1, $2, true) returning id",
    [name, verificationState]
  );
  return rows[0].id;
}

export async function seedPharmacyOperator(
  email: string,
  pharmacyId: string,
  role: "operator" | "manager" = "operator"
): Promise<UserFixture & { pharmacyId: string }> {
  const user = await seedUser(email, "Test Pharmacy Operator");
  await grantAppRole(user.userId, "patient");
  await query(
    "insert into pharmacy_memberships (user_id, pharmacy_id, role) values ($1, $2, $3)",
    [user.userId, pharmacyId, role]
  );
  await grantPlatformRole(
    user.userId,
    role === "manager" ? "pharmacy_manager" : "pharmacy_operator",
    "active",
    pharmacyId
  );
  return { ...user, pharmacyId };
}

// ── clinical data fixtures ────────────────────────────────────────────────

/**
 * One portfolio per user — `idx_portfolios_user_id_unique` (migration 005)
 * enforces it, so this helper is idempotent and returns the existing row
 * instead of violating the constraint.
 */
export async function seedPortfolio(userId: string, label = "Harness Portfolio"): Promise<string> {
  const existing = await one<{ id: string }>("select id from portfolios where user_id = $1", [
    userId,
  ]);
  if (existing) return existing.id;
  const rows = await query<{ id: string }>(
    "insert into portfolios (user_id, label) values ($1, $2) returning id",
    [userId, label]
  );
  return rows[0].id;
}

export interface DocumentFixture {
  documentId: string;
  storagePath: string;
}

/**
 * Insert a document row plus its private storage object.
 *
 * The storage path follows the CANONICAL convention the upload routes write:
 *   `{user_id}/{portfolio_id}/{document_id}/{filename}`
 * (see src/app/api/documents/route.ts). Any code that signs a URL must use the
 * stored value; a test that invents a different path would hide a real bug.
 */
export async function seedDocument(
  userId: string,
  options?: { name?: string; portfolioId?: string; storagePath?: string }
): Promise<DocumentFixture> {
  const portfolioId = options?.portfolioId ?? (await seedPortfolio(userId));
  const name = options?.name ?? "blood-panel.pdf";
  const documentId = crypto.randomUUID();
  const storagePath = options?.storagePath ?? `${userId}/${portfolioId}/${documentId}/file.pdf`;
  await query(
    `insert into documents (id, user_id, portfolio_id, original_name, storage_path, mime_type, size_bytes)
     values ($1, $2, $3, $4, $5, 'application/pdf', 1024)`,
    [documentId, userId, portfolioId, name, storagePath]
  );
  await query("insert into storage.objects (bucket_id, name, owner) values ('documents', $1, $2)", [
    storagePath,
    userId,
  ]);
  return { documentId, storagePath };
}

export async function seedCareRequest(
  userId: string,
  options?: { reason?: string; status?: string; triageCategory?: string | null }
): Promise<string> {
  const rows = await query<{ id: string }>(
    `insert into care_requests (user_id, reason, status, triage_category, idempotency_key)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      userId,
      options?.reason ?? "Routine consultation request",
      options?.status ?? "submitted",
      options?.triageCategory ?? "routine",
      crypto.randomUUID(),
    ]
  );
  return rows[0].id;
}

export async function assignCareRequest(options: {
  careRequestId: string;
  clinicianProfileId: string;
  assignedBy: string;
  facilityId?: string | null;
  state?: "assigned" | "accepted" | "declined" | "released";
}): Promise<string> {
  const rows = await query<{ id: string }>(
    `insert into care_request_assignments (care_request_id, clinician_id, facility_id, state, assigned_by)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      options.careRequestId,
      options.clinicianProfileId,
      options.facilityId ?? null,
      options.state ?? "assigned",
      options.assignedBy,
    ]
  );
  return rows[0].id;
}

export async function seedCareAppointment(options: {
  careRequestId: string;
  clinicianProfileId: string;
  patientId: string;
  state?: string;
  mode?: "text" | "audio" | "video";
}): Promise<string> {
  const rows = await query<{ id: string }>(
    `insert into care_appointments (care_request_id, clinician_id, patient_id, mode, state)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      options.careRequestId,
      options.clinicianProfileId,
      options.patientId,
      options.mode ?? "text",
      options.state ?? "assigned",
    ]
  );
  return rows[0].id;
}

export async function seedShareConsent(options: {
  careRequestId: string;
  patientId: string;
  documentIds: string[];
  revokedAt?: Date | null;
  grantedAt?: Date;
}): Promise<string> {
  const rows = await query<{ id: string }>(
    `insert into document_share_consents (care_request_id, patient_id, document_ids, granted_at, revoked_at)
     values ($1, $2, $3::uuid[], $4, $5) returning id`,
    [
      options.careRequestId,
      options.patientId,
      options.documentIds,
      (options.grantedAt ?? new Date()).toISOString(),
      options.revokedAt ? options.revokedAt.toISOString() : null,
    ]
  );
  return rows[0].id;
}

export async function seedDocumentAccess(options: {
  careRequestId: string;
  clinicianProfileId: string;
  expiresAt: Date;
  revokedAt?: Date | null;
}): Promise<string> {
  const rows = await query<{ id: string }>(
    `insert into clinician_document_access (care_request_id, clinician_profile_id, document_ids, expires_at, revoked_at)
     values ($1, $2, '{}'::uuid[], $3, $4) returning id`,
    [
      options.careRequestId,
      options.clinicianProfileId,
      options.expiresAt.toISOString(),
      options.revokedAt ? options.revokedAt.toISOString() : null,
    ]
  );
  return rows[0].id;
}

/**
 * NextRequest builder. Route handlers that read `req.nextUrl.searchParams`
 * (the pharmacy and upload routes) need a real NextRequest, not a bare
 * Request — passing the wrong shape would fail with a harness error instead of
 * testing the route.
 */
export function makeNextRequest(
  url: string,
  init?: { method?: string; body?: string | unknown; headers?: Record<string, string> }
): NextRequest {
  const body = init?.body === undefined || typeof init.body === "string"
    ? (init?.body as string | undefined)
    : JSON.stringify(init.body);
  return new NextRequest(url, {
    method: init?.method ?? "GET",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    body,
  });
}

/** Minimal Request builder for route handlers. */
export function makeRequest(
  url: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> }
): Request {
  const method = init?.method ?? "GET";
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/** Route params promise, as Next 16 hands it to handlers. */
export function routeParams<T extends Record<string, string>>(params: T): { params: Promise<T> } {
  return { params: Promise.resolve(params) };
}
