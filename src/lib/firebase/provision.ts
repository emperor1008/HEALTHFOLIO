/**
 * Identity provisioning — creates/repairs the P1 identity state for a Firebase
 * uid:
 *
 *   1. `users/{uid}` Firestore doc (profile fields, roles: ["patient"]) — the
 *      authoritative identity record from P1 onward (Section D of the P1 spec).
 *   2. P1-TEMP Postgres bridge: `INSERT INTO "user" … ON CONFLICT DO NOTHING`
 *      so migration 027's trigger mirrors the row into `auth.users` and every
 *      medical table's `user_id` FK stays satisfied while PG still serves data
 *      (removed together with PG data in P2/P5).
 *   3. P1-TEMP `role_policy_events` audit row on first creation only — parity
 *      with the Better Auth `databaseHooks` signup hook this replaces.
 *
 * UID FORMAT (spec amendment discovered during build): Firebase uids must be
 * UUIDs so one id works across Firebase Auth, Firestore doc ids, PG `user.id`
 * (UUID) and every medical-table FK. `POST /api/auth/register` therefore
 * creates the auth user server-side with `crypto.randomUUID()` as the uid.
 *
 * Error posture (parity with the deleted signup hook): auth/firestore failures
 * THROW (registration must not half-succeed silently), while the Postgres
 * bridge is BEST-EFFORT — a broken DATABASE_URL logs a warning and never
 * blocks sign-in or registration (the app's data routes report their own
 * degraded state, as they already do when Supabase env is missing).
 */
import { FieldValue } from "firebase-admin/firestore";
import type { Pool } from "pg";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { invalidateSessionProfileCache } from "@/lib/auth-session";

export interface ProvisionProfile {
  name?: string;
  dob?: string;
  gender?: string;
  region?: string;
  consent?: boolean;
}

export interface ProvisionResult {
  /** The users doc did not exist before this call. */
  docCreated: boolean;
  /** A legacy PG row already owns this email (registration must roll back). */
  pgEmailConflict: boolean;
  /** The PG identity bridge row was inserted (or already present). */
  pgBridged: boolean;
}

let pool: Pool | null = null;

async function getPgPool(): Promise<Pool> {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  const { Pool: PgPool } = await import("pg");
  pool = new PgPool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export async function provisionIdentity(
  uid: string,
  profile: ProvisionProfile = {}
): Promise<ProvisionResult> {
  const auth = getAdminAuth();
  const db = getAdminDb();

  // Authoritative email/name from the Firebase Auth record — never from the
  // request body (a cookie-authenticated caller can still be lying about
  // profile fields, but the auth record is server-created).
  const record = await auth.getUser(uid);
  const email = record.email ?? "";
  const displayName =
    profile.name?.trim() || record.displayName || "";

  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  const docCreated = !snap.exists;

  const data: Record<string, unknown> = {
    email,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (displayName) data.displayName = displayName;
  if (profile.dob !== undefined) data.dob = profile.dob;
  if (profile.gender !== undefined) data.gender = profile.gender;
  if (profile.region !== undefined) data.region = profile.region;
  if (profile.consent !== undefined) data.consent = profile.consent;
  if (docCreated) {
    // Signup default: exactly the patient role — never client-writable
    // (Firestore rules also pin create to roles == ["patient"]).
    data.createdAt = FieldValue.serverTimestamp();
    data.roles = ["patient"];
    data.status = "active";
  }
  await ref.set(data, { merge: true });

  let pgEmailConflict = false;
  let pgBridged = false;
  try {
    const pg = await getPgPool();
    const inserted = await pg.query(
      `INSERT INTO "user" (id, email, name, dob, gender, region)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        uid,
        email,
        displayName || "Healthfolio user",
        profile.dob ?? null,
        profile.gender ?? null,
        profile.region ?? null,
      ]
    );
    pgBridged = (inserted.rowCount ?? 0) > 0;
    if (pgBridged) {
      // Audit row only on FIRST creation — parity with the old signup hook.
      await pg.query(
        `INSERT INTO role_policy_events (event, role, target_user_id, metadata)
         VALUES ('role_assigned', 'patient', $1, '{}'::jsonb)`,
        [uid]
      );
    } else {
      // No insert: either this uid already exists (idempotent re-provision)
      // or a legacy Better-Auth row owns the email (fresh-start wrinkle —
      // registration must roll the Firebase user back; sign-in ignores it).
      const conflict = await pg.query(
        `SELECT 1 FROM "user" WHERE email = $1 AND id <> $2`,
        [email, uid]
      );
      pgEmailConflict = (conflict.rowCount ?? 0) > 0;
    }
  } catch (err) {
    // P1-TEMP: never block auth on the data bridge. Message carries no
    // credentials (pg connection errors name host/code only).
    console.warn(
      "[provision] P1-TEMP Postgres identity bridge unavailable:",
      err instanceof Error ? err.message : String(err)
    );
  }

  invalidateSessionProfileCache(uid);
  return { docCreated, pgEmailConflict, pgBridged };
}
