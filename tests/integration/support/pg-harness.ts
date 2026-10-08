/**
 * Phase 6 integration harness — real PostgreSQL engine.
 *
 * Boots PGlite (PostgreSQL 18 compiled to WASM) and applies the repository's
 * REAL migration files in order, so integration tests exercise the actual
 * schema, constraints, triggers, and RLS policies rather than a hand-written
 * mock. A small Supabase-compatibility shim provides the pieces that only
 * exist inside a hosted Supabase project:
 *
 *   - `auth.users`, `auth.uid()`, `auth.role()`, `auth.jwt()`
 *   - `storage.buckets`, `storage.objects`, `storage.foldername()`
 *   - the `anon`, `authenticated`, `service_role` roles and Supabase's default
 *     table grants (service_role additionally gets BYPASSRLS, as in Supabase)
 *
 * Why PGlite: it is a local, zero-cost, deterministic Postgres. It lets the
 * Phase 6 RLS verification execute real policies. It is NOT the hosted
 * Supabase project — results from here are labelled
 * "NOT VERIFIED — EXTERNAL ENVIRONMENT" for anything that depends on hosted
 * infrastructure (hosted Postgres settings, PostgREST/GoTrue/Realtime/Storage
 * services, network auth). See docs/phase6-live-verification.md.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

export interface SqlResult<T> {
  rows: T[];
  affectedRows?: number;
}

export interface SqlExecutor {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlResult<T>>;
}

/** Databases for the Phase 6 harness. `role` selects the RLS identity. */
export interface HealthfolioDb {
  sql: SqlExecutor;
  /** Switch the connection role: service_role (app), authenticated, or anon. */
  asRole(role: "anon" | "authenticated" | "service_role"): Promise<void>;
  /** Become an authenticated end user (sets the JWT claims auth.uid() reads). */
  asUser(userId: string, extraClaims?: Record<string, unknown>): Promise<void>;
  /** Clear JWT claims (anonymous request). */
  asAnon(): Promise<void>;
  close(): Promise<void>;
  /** Migrations that failed to apply — must be empty for a healthy harness. */
  migrationFailures: string[];
}

const SUPABASE_SHIM = `
create schema if not exists auth;
create schema if not exists storage;

-- Roles that exist in every Supabase project. service_role bypasses RLS,
-- exactly like the hosted platform's server key.
create role anon noinherit;
create role authenticated noinherit;
create role service_role noinherit;
alter role service_role bypassrls;

-- GoTrue's user table. Column-for-column the shape a hosted Supabase project
-- ships, because migration 027's identity bridge writes into it
-- (instance_id, aud, role, encrypted_password, confirmation/recovery tokens).
create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token text,
  confirmation_sent_at timestamptz,
  recovery_token text,
  recovery_sent_at timestamptz,
  email_change_token_new text,
  email_change text,
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  phone text unique default null,
  phone_confirmed_at timestamptz,
  email_change_token_current text,
  email_change_confirm_status smallint default 0,
  banned_until timestamptz,
  reauthentication_token text,
  reauthentication_sent_at timestamptz,
  is_sso_user boolean not null default false,
  deleted_at timestamptz,
  is_anonymous boolean not null default false
);

-- auth.uid()/auth.role()/auth.jwt() read the request JWT claims. Supabase's
-- implementations read request.jwt.claims; this shim reads the same settings
-- with the claim keys PostgREST populates, so policies evaluate identically.
create or replace function auth.uid() returns uuid
  language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$fn$;

create or replace function auth.role() returns text
  language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    'anon'
  )
$fn$;

create or replace function auth.jwt() returns jsonb
  language sql stable as $fn$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  )
$fn$;

create table if not exists storage.buckets (
  id text primary key,
  name text unique,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $fn$
  select string_to_array(name, '/')
$fn$;

-- Privileges, mirroring a hosted Supabase project. Supabase sets DEFAULT
-- PRIVILEGES on the public schema, so every table a migration creates is
-- automatically granted to the API roles — and a migration that later REVOKEs
-- them (031) keeps that revoke. Granting after the fact instead would silently
-- re-open what a migration closed.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Privileges, mirroring a hosted Supabase project:
--   * service_role can read/write auth + storage (server-side key)
--   * authenticated can read storage metadata only, and reaches nothing in auth;
--     GoTrue's tables are never exposed to API roles
--   * anon gets functions but no table privileges
grant usage on schema auth to anon, authenticated, service_role;
grant all on all tables in schema auth to service_role;
grant all on all sequences in schema auth to service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

grant usage on schema storage to anon, authenticated, service_role;
grant all on all tables in schema storage to service_role;
grant select on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
grant execute on all functions in schema storage to anon, authenticated, service_role;
`;

/**
 * Boot a database, apply the Supabase shim, then every migration in
 * `supabase/migrations` sorted by filename. Failures are collected (not
 * thrown) so a test can assert that the whole migration set applies.
 */
export async function createHealthfolioDb(options?: {
  migrationsDir?: string;
  quiet?: boolean;
}): Promise<HealthfolioDb> {
  const pg = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
  const sql = pg as unknown as SqlExecutor;

  await sql.exec(SUPABASE_SHIM);

  const dir = options?.migrationsDir ?? path.join(process.cwd(), "supabase", "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const migrationFailures: string[] = [];
  for (const file of files) {
    const contents = fs.readFileSync(path.join(dir, file), "utf8");
    try {
      await sql.exec(contents);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      migrationFailures.push(`${file}: ${message.split("\n")[0]}`);
      if (!options?.quiet) {
        // eslint-disable-next-line no-console
        console.warn(`[pg-harness] migration failed: ${file} — ${message.split("\n")[0]}`);
      }
    }
  }

  // RLS decides row visibility on top of the Supabase-style default
  // privileges installed by the shim.
  await sql.exec(`grant usage on schema public to anon, authenticated, service_role;`);

  let closed = false;
  const db: HealthfolioDb = {
    sql,
    migrationFailures,
    async asRole(role) {
      await sql.exec(`set role ${role}`);
    },
    async asUser(userId, extraClaims) {
      await sql.exec("set role authenticated");
      await sql.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
      await sql.query("select set_config('request.jwt.claim.role', $1, false)", [
        "authenticated",
      ]);
      const claims = JSON.stringify({ sub: userId, role: "authenticated", ...extraClaims });
      await sql.query("select set_config('request.jwt.claims', $1, false)", [claims]);
    },
    async asAnon() {
      await sql.exec("set role anon");
      await sql.exec("select set_config('request.jwt.claim.sub', '', false)");
      await sql.exec("select set_config('request.jwt.claims', '', false)");
    },
    async close() {
      if (closed) return;
      closed = true;
      await pg.close();
    },
  };

  return db;
}

/** Insert an auth.users row (GoTrue identity) and return its UUID. */
export async function createAuthUser(
  db: HealthfolioDb,
  email: string
): Promise<string> {
  const { rows } = await db.sql.query<{ id: string }>(
    "insert into auth.users (email) values ($1) returning id",
    [email]
  );
  return rows[0].id;
}
