/**
 * Database-backed authentication service (replaces Supabase Auth / GoTrue).
 *
 * Everything about an account lives in ordinary tables (migration 032):
 *
 *   auth_accounts    — normalized unique email + scrypt password hash
 *   auth_sessions    — SHA-256 of an opaque random cookie token, expiry, revocation
 *   auth_reset_tokens— single-use, short-lived recovery tokens (hashed at rest)
 *
 * Guarantees:
 *  - Plaintext passwords never touch storage (scrypt, N=16384 r=8 p=1,
 *    16-byte random salt per password, 64-byte derived key).
 *  - Session tokens are 32 bytes of CSPRNG entropy. Only their SHA-256 is
 *    stored, so a database leak cannot be replayed as a login.
 *  - Verification is constant-time (`timingSafeEqual`), and a login attempt
 *    for an unknown account still performs a dummy scrypt so response time
 *    does not reveal whether the email exists (account enumeration).
 *  - Server-only: this module reads HTTP-only cookies' contents, never
 *    localStorage, and is never imported from a client component.
 */
import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { getSql } from "@/lib/db";

const scryptAsync = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

/** 7 days — matches the existing session-cookie lifetime. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
/** Recovery tokens are short-lived by design. */
export const RESET_TTL_SECONDS = 60 * 30;

export interface AuthAccount {
  id: string;
  email: string;
  emailNormalized: string;
  displayName: string | null;
  roles: string[];
  disabled: boolean;
}

export type RegisterResult =
  | { ok: true; account: AuthAccount }
  | { ok: false; code: "EMAIL_TAKEN" | "WEAK_PASSWORD" | "INVALID_INPUT" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

// ─── password hashing ────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Constant-time password check. Returns false (never throws) for malformed
 * or unknown-algorithm hashes so a corrupt row cannot become an auth bypass.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p))
      return false;
    const salt = Buffer.from(parts[4], "base64");
    const expected = Buffer.from(parts[5], "base64");
    if (salt.length === 0 || expected.length === 0) return false;
    const derived = await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });
    return (
      derived.length === expected.length && timingSafeEqual(derived, expected)
    );
  } catch {
    return false;
  }
}

/** Burn an equivalent amount of CPU for "no such account" logins. */
const DUMMY_HASH_PROMISE = hashPassword("healthfolio-dummy-password");
export async function burnPasswordWork(password: string): Promise<void> {
  const dummy = await DUMMY_HASH_PROMISE;
  await verifyPassword(password, dummy);
}

// ─── accounts ────────────────────────────────────────────────────────────

interface AccountRow {
  id: string;
  email: string;
  email_normalized: string;
  password_hash: string;
  display_name: string | null;
  roles: string[] | null;
  disabled: boolean;
}

function toAccount(row: AccountRow): AuthAccount {
  return {
    id: row.id,
    email: row.email,
    emailNormalized: row.email_normalized,
    displayName: row.display_name,
    roles: Array.isArray(row.roles) ? row.roles : [],
    disabled: row.disabled,
  };
}

const ACCOUNT_COLUMNS =
  "id, email, email_normalized, password_hash, display_name, roles, disabled";

function isUniqueViolation(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  return code === "23505";
}

/** Create an account. Email is normalized + unique; password is hashed here. */
export async function registerAccount(input: {
  email: string;
  password: string;
  displayName?: string | null;
  roles?: string[];
}): Promise<RegisterResult> {
  const emailNormalized = normalizeEmail(input.email ?? "");
  if (!EMAIL_RE.test(emailNormalized))
    return { ok: false, code: "INVALID_INPUT" };
  if (
    typeof input.password !== "string" ||
    input.password.length < MIN_PASSWORD ||
    input.password.length > MAX_PASSWORD
  ) {
    return { ok: false, code: "WEAK_PASSWORD" };
  }

  const sql = await getSql();
  const passwordHash = await hashPassword(input.password);
  try {
    const { rows } = await sql.query<AccountRow>(
      `insert into auth_accounts (email_normalized, email, password_hash, display_name, roles)
       values ($1, $2, $3, $4, $5)
       returning ${ACCOUNT_COLUMNS}`,
      [
        emailNormalized,
        input.email.trim(),
        passwordHash,
        input.displayName?.trim() || null,
        input.roles && input.roles.length > 0 ? input.roles : ["patient"],
      ],
    );
    return { ok: true, account: toAccount(rows[0]) };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, code: "EMAIL_TAKEN" };
    throw error;
  }
}

/** Look an account up by normalized email. */
export async function findAccountByEmail(
  email: string,
): Promise<AuthAccount | null> {
  const sql = await getSql();
  const { rows } = await sql.query<AccountRow>(
    `select ${ACCOUNT_COLUMNS} from auth_accounts where email_normalized = $1`,
    [normalizeEmail(email ?? "")],
  );
  const row = rows[0];
  if (!row || row.disabled) return null;
  return toAccount(row);
}

/**
 * Verify credentials. Returns the account or null — the SAME null for
 * "unknown email", "wrong password" and "disabled", so callers cannot be
 * used to enumerate accounts.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<{ id: string; email: string; displayName: string | null } | null> {
  const sql = await getSql();
  const { rows } = await sql.query<AccountRow>(
    `select ${ACCOUNT_COLUMNS} from auth_accounts where email_normalized = $1`,
    [normalizeEmail(email ?? "")],
  );
  const row = rows[0];
  if (!row || row.disabled) {
    await burnPasswordWork(password ?? "");
    return null;
  }
  const ok = await verifyPassword(password ?? "", row.password_hash);
  if (!ok) return null;
  return { id: row.id, email: row.email, displayName: row.display_name };
}

// ─── sessions ────────────────────────────────────────────────────────────

export interface IssuedSession {
  /** Plaintext token — goes ONLY into the HttpOnly cookie. */
  token: string;
  expiresAt: Date;
}

export async function createSession(
  accountId: string,
  userAgent?: string | null,
): Promise<IssuedSession> {
  const sql = await getSql();
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await sql.query(
    `insert into auth_sessions (account_id, token_hash, expires_at, user_agent)
     values ($1, $2, $3, $4)`,
    [
      accountId,
      sha256(token),
      expiresAt.toISOString(),
      (userAgent ?? "").slice(0, 300),
    ],
  );
  return { token, expiresAt };
}

/**
 * Resolve a cookie token to an account. Returns null for unknown, expired,
 * revoked, or disabled-account tokens — callers treat every case as
 * signed-out.
 *
 * A token containing "." is a JWT (the previous Firebase session cookie), so
 * it is skipped here and handled by that provider's verifier instead.
 */
export async function resolveSession(
  token: string,
): Promise<AuthAccount | null> {
  if (!token || token.includes(".")) return null;
  const sql = await getSql();
  const { rows } = await sql.query<AccountRow>(
    `select a.id, a.email, a.email_normalized, a.display_name, a.roles, a.disabled
       from auth_sessions s
       join auth_accounts a on a.id = s.account_id
      where s.token_hash = $1
        and s.revoked_at is null
        and s.expires_at > now()
        and a.disabled = false
      limit 1`,
    [sha256(token)],
  );
  const row = rows[0];
  return row ? toAccount({ ...row, password_hash: "" }) : null;
}

/** Logout: revoke the presented session (idempotent — always "succeeds"). */
export async function revokeSession(token: string): Promise<void> {
  if (!token || token.includes(".")) return;
  const sql = await getSql();
  await sql.query(
    `update auth_sessions set revoked_at = now() where token_hash = $1 and revoked_at is null`,
    [sha256(token)],
  );
}

/** Revoke every session of an account (password change / account deletion). */
export async function revokeAllSessions(accountId: string): Promise<void> {
  const sql = await getSql();
  await sql.query(
    `update auth_sessions set revoked_at = now() where account_id = $1 and revoked_at is null`,
    [accountId],
  );
}

/** Housekeeping: drop rows that can never authenticate again. */
export async function purgeExpiredSessions(): Promise<void> {
  const sql = await getSql();
  await sql.query(
    `delete from auth_sessions where expires_at < now() - interval '7 days'`,
  );
  await sql.query(`delete from auth_reset_tokens where expires_at < now()`);
}

// ─── password recovery ───────────────────────────────────────────────────

/**
 * Create a single-use recovery token for an account.
 *
 * Returns the PLAINTEXT token so the route can hand it to whatever delivery
 * channel is actually configured. When none is, the route must say so rather
 * than claim an email was sent (spec: "Do not pretend to send email if email
 * delivery is not configured").
 *
 * The response is identical for unknown and known addresses: `token` is only
 * set for a real account, and callers must not surface that difference.
 */
export async function createResetToken(email: string): Promise<string | null> {
  const account = await findAccountByEmail(email);
  if (!account) return null;
  const sql = await getSql();
  const token = newToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_SECONDS * 1000);
  await sql.query(
    `insert into auth_reset_tokens (account_id, token_hash, expires_at) values ($1, $2, $3)`,
    [account.id, sha256(token), expiresAt.toISOString()],
  );
  return token;
}

/** Validate + consume a recovery token. Single use: a second call fails. */
export async function consumeResetToken(
  token: string,
): Promise<AuthAccount | null> {
  if (!token || token.includes(".")) return null;
  const sql = await getSql();
  const { rows } = await sql.query<{ account_id: string }>(
    `update auth_reset_tokens
        set used_at = now()
      where token_hash = $1
        and used_at is null
        and expires_at > now()
      returning account_id`,
    [sha256(token)],
  );
  const accountId = rows[0]?.account_id;
  if (!accountId) return null;
  return findAccountById(accountId);
}

export async function findAccountById(id: string): Promise<AuthAccount | null> {
  const sql = await getSql();
  const { rows } = await sql.query<AccountRow>(
    `select ${ACCOUNT_COLUMNS} from auth_accounts where id = $1 and disabled = false`,
    [id],
  );
  return rows[0] ? toAccount(rows[0]) : null;
}

/**
 * Permanently remove an account and everything that hangs off it
 * (sessions and recovery tokens cascade). Returns false when no such
 * account exists, so the caller can distinguish "already gone" from a
 * database failure.
 */
export async function deleteAccount(accountId: string): Promise<boolean> {
  const sql = await getSql();
  const { rows } = await sql.query<{ id: string }>(
    "delete from auth_accounts where id = $1 returning id",
    [accountId],
  );
  return rows.length > 0;
}

export async function setPassword(
  accountId: string,
  password: string,
): Promise<boolean> {
  if (
    typeof password !== "string" ||
    password.length < MIN_PASSWORD ||
    password.length > MAX_PASSWORD
  ) {
    return false;
  }
  const sql = await getSql();
  const hash = await hashPassword(password);
  await sql.query(
    `update auth_accounts set password_hash = $1, updated_at = now() where id = $2`,
    [hash, accountId],
  );
  // A password change invalidates every existing session.
  await revokeAllSessions(accountId);
  return true;
}
