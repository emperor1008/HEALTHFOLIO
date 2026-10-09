/**
 * Supabase compatibility SQL for a LOCAL Postgres (PGlite).
 *
 * A hosted Supabase project ships services that do not exist in plain
 * PostgreSQL: the `auth` schema (GoTrue), the `storage` schema, the
 * `anon` / `authenticated` / `service_role` API roles and Supabase's default
 * table grants. This module installs those pieces so the repository's REAL
 * migration files apply unchanged against a local database — which is what
 * makes the local preview database an honest stand-in instead of a mock.
 *
 * Shared by:
 *   - the local/preview database runtime (src/lib/db/local.ts)
 *   - the Phase 6 integration harness (tests/integration/support/pg-harness.ts)
 */
export const SUPABASE_COMPAT_SQL = `
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
