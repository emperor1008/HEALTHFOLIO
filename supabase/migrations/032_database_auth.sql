-- 032: Database-backed authentication (replaces Supabase Auth / GoTrue).
--
-- Why: the application no longer relies on an external identity provider.
-- Accounts live in normal tables next to the rest of the data, passwords are
-- stored ONLY as scrypt hashes, and browser sessions are opaque random tokens
-- stored as SHA-256 hashes (the plaintext token exists solely in the HttpOnly
-- cookie).
--
-- Access model: server-side only. RLS is enabled and the API roles are
-- revoked, so nothing that talks to this schema through PostgREST can read a
-- hash or a session row. The application reaches these tables over the
-- server-side connection (DATABASE_URL / local database), exactly like every
-- other direct SQL in the codebase.

create table if not exists auth_accounts (
  id uuid primary key default gen_random_uuid(),
  -- Normalized (lowercased, trimmed) unique email — the login key.
  email_normalized text not null unique,
  -- Display form of the address as the user typed it.
  email text not null,
  -- scrypt$N$r$p$<salt-b64>$<hash-b64> — never a plaintext password.
  password_hash text not null,
  display_name text,
  -- Roles are re-validated against APP_ROLES in the session resolver; this
  -- column only seeds what a fresh registration starts with.
  roles text[] not null default array['patient'],
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_accounts_email_format check (position('@' in email_normalized) > 1)
);

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth_accounts (id) on delete cascade,
  -- SHA-256 of the opaque cookie token. The token itself is never stored.
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text
);

create index if not exists auth_sessions_account_idx on auth_sessions (account_id);
create index if not exists auth_sessions_expiry_idx on auth_sessions (expires_at);

-- Password recovery: single-use, short-lived, hashed-at-rest tokens. The
-- plaintext is delivered only through the configured delivery channel (see
-- docs/auth-database.md); when no channel is configured the API reports that
-- honestly instead of pretending an email was sent.
create table if not exists auth_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth_accounts (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists auth_reset_tokens_account_idx on auth_reset_tokens (account_id);

-- Server-only schema: no API role may read credentials or sessions.
alter table auth_accounts enable row level security;
alter table auth_sessions enable row level security;
alter table auth_reset_tokens enable row level security;

revoke all on auth_accounts from anon, authenticated;
revoke all on auth_sessions from anon, authenticated;
revoke all on auth_reset_tokens from anon, authenticated;

-- Login throttling lives in memory per process (src/lib/api/rate-limit.ts);
-- this index keeps the "find account by email" lookup on the unique path.
create index if not exists auth_accounts_email_normalized_idx on auth_accounts (email_normalized);
