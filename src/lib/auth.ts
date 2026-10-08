/**
 * Better Auth instance — the platform's single source of authentication.
 *
 * Better Auth owns identity (users, sessions, credential accounts) in its own
 * canonical tables (migration 027) inside the same PostgreSQL database that
 * holds the medical tables. Supabase remains database + private storage only.
 *
 * This module is SERVER-ONLY. It reads DATABASE_URL / BETTER_AUTH_SECRET and
 * must never be imported from client code. `pg` connects over the same
 * DATABASE_URL used by the auth tables; medical tables are only ever touched
 * by Supabase clients after this module has produced a session.
 *
 * LAZY INITIALIZATION: the Better Auth instance and its pg pool are created on
 * first USE, not at import. Build-time page-data collection imports this
 * module transitively (via session helpers), so a missing DATABASE_URL must
 * not throw during `next build`. At runtime, a missing configuration simply
 * means "no session can be resolved" — surfaces render truthful signed-out or
 * not-configured states, and the auth handler answers 503.
 *
 * SECURITY:
 * - No secret is ever logged or embedded in responses.
 * - Cookies are HTTP-only, same-site lax, Secure in production (Better Auth
 *   defaults; `useSecureCookies` is pinned on when NODE_ENV=production).
 * - Session expiry defaults to 7 days with 1-day inactivity refresh.
 * - Rate limiting is enabled for auth endpoints (bounded in-memory store;
 *   production deployments with multiple instances should back it with a
 *   shared store via advanced.rateLimit.storage).
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import type { BetterAuthInstance } from "./auth-types";

const databaseUrl = process.env.DATABASE_URL;
const authSecret = process.env.BETTER_AUTH_SECRET;

/** True when the server has the minimum env to run authentication. */
export function isAuthConfigured(): boolean {
  return Boolean(databaseUrl && authSecret);
}

let instance: BetterAuthInstance | null = null;
let initPromise: Promise<BetterAuthInstance> | null = null;

async function createInstance(): Promise<BetterAuthInstance> {
  if (!databaseUrl || !authSecret) {
    // Never include any env VALUE in errors.
    throw new Error(
      "Authentication is not configured: DATABASE_URL and BETTER_AUTH_SECRET are required (see README: Environment Variables)."
    );
  }
  const { Pool } = await import("pg");
  const connectionPool = new Pool({
    connectionString: databaseUrl,
    // Bounded pool for serverless/low-traffic deployments.
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    secret: authSecret,
    database: connectionPool,
    emailAndPassword: {
      enabled: true,
      // Password strength: minimum 8 chars (Better Auth default) — enforced
      // additionally by the registration Zod schema.
      requireEmailVerification: false,
    },
    user: {
      additionalFields: {
        dob: { type: "string", required: false, input: true },
        gender: { type: "string", required: false, input: true },
        region: { type: "string", required: false, input: true },
      },
    } satisfies BetterAuthOptions["user"],
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh every 1 day of activity
    },
    advanced: {
      cookiePrefix: "healthfolio",
      useSecureCookies: process.env.NODE_ENV === "production",
      database: {
        // UUID ids: identical format to every medical-table user_id FK
        // (migrations 001–026 use `user_id UUID`).
        generateId: "uuid",
      },
    },
    rateLimit: {
      enabled: true,
      window: 60, // seconds
      max: 10, // attempts per window per IP+route
    },
    // Role policy: public registration creates ONLY the patient role — assigned
    // server-side in the registry (migration 027). No client input can pick a
    // role; doctors go through doctor_pending + admin approval; platform_admin
    // exists only via the local bootstrap script.
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              const { getServerSupabase } = await import("@/lib/supabase/user-context");
              const supabase = getServerSupabase();
              await supabase.from("app_roles").upsert(
                { user_id: user.id, role: "patient", status: "active" },
                { onConflict: "user_id,role" }
              );
              await supabase.from("role_policy_events").insert({
                event: "role_assigned",
                role: "patient",
                target_user_id: user.id,
                metadata: {},
              });
            } catch {
              // Never block signup on audit issues; the role upsert failing is
              // retried by the health-space consent gate on first app load.
            }
          },
        },
      },
    },
    logger: {
      disabled: false,
      // Never log request bodies (could contain passwords or licence numbers).
      logLevel: "error",
    },
  });
}

/**
 * Resolve the Better Auth instance, building it on first use.
 * Returns `null` when authentication is not configured — callers treat this
 * as "no session exists" (or 503 for the auth handler), never a crash.
 */
export async function getAuth(): Promise<BetterAuthInstance | null> {
  if (!isAuthConfigured()) return null;
  if (instance) return instance;
  if (!initPromise) {
    initPromise = createInstance()
      .then((created) => {
        instance = created;
        return created;
      })
      .catch((err) => {
        initPromise = null;
        throw err;
      });
  }
  return initPromise;
}

/**
 * Like `getAuth()` but throws when authentication is not configured — for
 * flows that must have it (e.g. the credential endpoints' handler).
 */
export async function requireAuth(): Promise<BetterAuthInstance> {
  const auth = await getAuth();
  if (!auth)
    throw new Error(
      "Authentication is not configured on this server: DATABASE_URL and BETTER_AUTH_SECRET are required."
    );
  return auth;
}

export type { BetterAuthInstance };
export type AuthSession = NonNullable<
  Awaited<ReturnType<BetterAuthInstance["api"]["getSession"]>>
>;
