"use client";

/**
 * Firebase Auth browser surface — the ONLY auth API client components use
 * (Firebase Migration P1, Section C). It keeps the old Better Auth client's
 * call-site shapes so the auth forms and VoiceAssistant retain their exact
 * flows, error strings and redirect logic:
 *
 *   signIn.email({ email, password, callbackURL? })
 *     └─ signInWithEmailAndPassword → ID token
 *     └─ POST /api/auth/session   (mint the HttpOnly `__session` cookie)
 *     └─ POST /api/auth/provision (fire-and-forget identity ensure)
 *
 *   signUp.email({ email, password, name, dob, gender?, region?, consent })
 *     └─ POST /api/auth/register  (server creates the user with a UUID uid
 *        and provisions users/{uid} + the P1-TEMP PG bridge) → { customToken }
 *     └─ signInWithCustomToken → session exchange → provision (idempotent)
 *
 *   signOut()   ── Firebase signOut() + POST /api/auth/sign-out (cookie clear)
 *   useSession() ── { data, isPending } from onAuthStateChanged/onIdTokenChanged
 *                   with `users/{uid}.roles` merged in as `user.activeRoles`
 *
 * Session model: the SDK holds the signed-in user (its own persistence),
 * server routes trust only the HttpOnly `__session` cookie minted from an ID
 * token. FirebaseAuthProvider (src/app/providers.tsx) re-exchanges on token
 * refresh so the cookie never outlives its 7d lifetime. This module never
 * navigates — post-login routing stays with the forms (`?redirect=` +
 * GET /api/auth/home), exactly as before.
 */
import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getClientAuth, getClientDb } from "@/lib/firebase/client";
import { isFirebaseClientConfigured } from "@/lib/firebase/config";

/* ─────────────────────────── result shapes ─────────────────────────── */

export interface AuthClientError {
  /** Status the forms branch on — same contract as the old client. */
  status: number;
  /** Machine code (Firebase `auth/*` or an API route `{code}`); never user-facing. */
  code?: string;
}

export interface AuthResult {
  data: { ok: true } | null;
  error: AuthClientError | null;
}

/* ──────────────────────────── auth instance ────────────────────────── */

/**
 * Firebase Auth instance, resolved lazily on FIRST PROPERTY ACCESS: auth
 * pages are prerendered at build time where the web config may be absent,
 * so importing this module must never initialize Firebase (same constraint
 * as `firebase/client.ts`). Call sites only touch it inside event handlers
 * and effects, i.e. in the browser.
 */
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    const instance = getClientAuth();
    const value: unknown = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/* ───────────────────────────── helpers ─────────────────────────────── */

/** Firebase `auth/*` code carried by an SDK error, if any. */
function firebaseCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

/** Non-2xx from an auth API route — carries its status/code into the result. */
class AuthHttpError extends Error {
  constructor(
    readonly status: number,
    readonly routeCode?: string
  ) {
    super(`auth route failed with status ${status}`);
    this.name = "AuthHttpError";
  }
}

/**
 * Firebase code → status for sign-in. The forms keep their existing friendly
 * messages: 401/429 → the one generic credential message (never reveals
 * whether the email exists), ≥500 → "something went wrong on our side".
 */
const SIGN_IN_STATUS_BY_CODE: Record<string, number> = {
  "auth/invalid-credential": 401,
  "auth/wrong-password": 401,
  "auth/user-not-found": 401,
  "auth/invalid-email": 401,
  "auth/user-disabled": 401,
  "auth/too-many-requests": 429,
  "auth/internal-error": 500,
  "auth/server-error": 500,
  "auth/invalid-api-key": 500,
  "auth/operation-not-allowed": 500,
  "auth/app-not-authorized": 500,
  "auth/project-not-found": 500,
};

/**
 * Mint the HttpOnly `__session` cookie from a fresh Firebase ID token.
 * Throws `AuthHttpError` on non-2xx (route status + code preserved) and
 * lets network failures propagate, so callers keep the "can't reach us" vs
 * "server said no" distinction the forms rely on.
 */
async function exchangeSession(idToken: string): Promise<void> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { code?: string } | null;
    throw new AuthHttpError(res.status, body?.code);
  }
}

/**
 * Fire-and-forget identity ensure (Section D): idempotent, cookie-authenticated,
 * never blocks the user — a failed run is retried on the next sign-in.
 */
function ensureProvisioned(): void {
  void fetch("/api/auth/provision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => {
    // Offline / rate-limited — provisioning is idempotent and not required
    // for the sign-in UX to complete.
  });
}

/* ─────────────────────────── sign-in / sign-up ─────────────────────── */

export interface SignInEmailParams {
  email: string;
  password: string;
  /**
   * Call-site parity with the old client only. Post-login routing is decided
   * by GET /api/auth/home (role landing) or the form's sanitized
   * `?redirect=` param — the old client never used this client-side either,
   * so redirect behavior is unchanged.
   */
  callbackURL?: string;
}

export interface SignUpEmailParams {
  email: string;
  password: string;
  name: string;
  dob: string;
  gender?: "female" | "male" | "other";
  region?: string;
  consent: true;
  /** See SignInEmailParams.callbackURL — accepted, never used to navigate. */
  callbackURL?: string;
}

async function signInEmail({
  email,
  password,
}: SignInEmailParams): Promise<AuthResult> {
  let idToken: string;
  try {
    const cred = await signInWithEmailAndPassword(getClientAuth(), email, password);
    idToken = await cred.user.getIdToken();
  } catch (err) {
    const code = firebaseCode(err);
    // Network failures (and anything unrecognized) THROW — the form's catch
    // shows "we couldn't reach Healthfolio" and never blames the password.
    if (!code || code === "auth/network-request-failed") throw err;
    return { data: null, error: { status: SIGN_IN_STATUS_BY_CODE[code] ?? 500, code } };
  }

  try {
    await exchangeSession(idToken);
  } catch (err) {
    if (err instanceof AuthHttpError) {
      return { data: null, error: { status: err.status, code: err.routeCode } };
    }
    throw err; // network — form shows the connection message
  }

  ensureProvisioned();
  return { data: { ok: true }, error: null };
}

async function signUpEmail({
  email,
  password,
  name,
  dob,
  gender,
  region,
  consent,
}: SignUpEmailParams): Promise<AuthResult> {
  // Server-first: the register route validates the same RegisterSchema,
  // creates the auth user with a UUID uid, provisions users/{uid} + the
  // P1-TEMP Postgres bridge, and answers with a custom token. A fetch
  // rejection propagates so the form shows its connection message.
  const registerRes = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, dob, gender, region, consent }),
  });
  if (!registerRes.ok) {
    const body = (await registerRes.json().catch(() => null)) as { code?: string } | null;
    return { data: null, error: { status: registerRes.status, code: body?.code } };
  }

  let customToken: unknown;
  try {
    const body = (await registerRes.json()) as { data?: { customToken?: unknown } } | null;
    customToken = body?.data?.customToken;
  } catch {
    customToken = null;
  }
  if (typeof customToken !== "string" || !customToken) {
    return { data: null, error: { status: 500, code: "INVALID_RESPONSE" } };
  }

  let idToken: string;
  try {
    const cred = await signInWithCustomToken(getClientAuth(), customToken);
    idToken = await cred.user.getIdToken();
  } catch (err) {
    const code = firebaseCode(err);
    if (!code || code === "auth/network-request-failed") throw err;
    // The account exists server-side by now — never a client-input error.
    return { data: null, error: { status: 500, code } };
  }

  try {
    await exchangeSession(idToken);
  } catch (err) {
    if (err instanceof AuthHttpError) {
      return { data: null, error: { status: err.status, code: err.routeCode } };
    }
    throw err;
  }

  ensureProvisioned();
  return { data: { ok: true }, error: null };
}

export const signIn = { email: signInEmail };
export const signUp = { email: signUpEmail };

/* ────────────────────────────── sign-out ───────────────────────────── */

/**
 * Sign out on both sides: the SDK session (client) and the HttpOnly cookie
 * (server additionally revokes refresh tokens). Each side is best-effort —
 * signing out must always "succeed" locally.
 */
export async function signOut(): Promise<void> {
  if (isFirebaseClientConfigured()) {
    try {
      await firebaseSignOut(getClientAuth());
    } catch {
      // Local persistence may already be cleared (or offline) — still drop
      // the cookie below.
    }
  }
  try {
    await fetch("/api/auth/sign-out", { method: "POST" });
  } catch {
    // Network failure: the SDK session is gone, so the cookie is inert
    // (routes 401 on data calls) until it expires or the next sign-out.
  }
}

/* ────────────────────────────── useSession ─────────────────────────── */

export interface FirebaseSessionUser {
  id: string;
  email: string;
  name?: string;
  /**
   * Identity roles from `users/{uid}.roles` (client read under owner-only
   * rules; the server stays authoritative). `undefined` until the identity
   * doc resolves — consumers treat that exactly like "no roles yet".
   */
  activeRoles?: string[];
}

export interface FirebaseSession {
  user: FirebaseSessionUser;
}

export interface UseSessionResult {
  data: FirebaseSession | null;
  isPending: boolean;
}

/**
 * Session hook with the old `useSession()` contract: `{ data, isPending }`,
 * loading until the first auth callback. Signed-in users additionally get a
 * one-time read of `users/{uid}` merged in as `user.activeRoles` + a display
 * name fallback, which is what VoiceAssistant derives its role from.
 */
export function useSession(): UseSessionResult {
  const [data, setData] = useState<FirebaseSession | null>(null);
  // Lazy initializer: with no Firebase web config there is nothing to load,
  // so start resolved (the loading flag only ever flips inside auth
  // callbacks — never synchronously in the effect body).
  const [isPending, setIsPending] = useState(() => !isFirebaseClientConfigured());

  useEffect(() => {
    if (!isFirebaseClientConfigured()) {
      // No web config: honest signed-out state (auth pages still render).
      return;
    }

    let cancelled = false;
    let activeUid: string | null = null;

    const loadIdentity = async (uid: string) => {
      try {
        const snap = await getDoc(doc(getClientDb(), "users", uid));
        if (cancelled || activeUid !== uid || !snap.exists()) return;
        const raw = snap.data() ?? {};
        const roles = Array.isArray(raw.roles)
          ? raw.roles.filter((r): r is string => typeof r === "string")
          : [];
        const docName =
          typeof raw.displayName === "string" && raw.displayName
            ? raw.displayName
            : undefined;
        setData((prev) =>
          prev && prev.user.id === uid
            ? {
                user: {
                  ...prev.user,
                  name: prev.user.name ?? docName,
                  activeRoles: roles,
                },
              }
            : prev
        );
      } catch {
        // Offline or rules denial — roles stay undefined; VoiceAssistant
        // falls back to its null-role state instead of guessing.
      }
    };

    const apply = (user: User | null) => {
      if (cancelled) return;
      setIsPending(false); // first callback ends the loading state
      if (!user) {
        activeUid = null;
        setData(null);
        return;
      }
      // Both listeners report the same user — only the first one applies.
      if (user.uid === activeUid) return;
      activeUid = user.uid;
      setData({
        user: {
          id: user.uid,
          email: user.email ?? "",
          name: user.displayName || undefined,
        },
      });
      void loadIdentity(user.uid);
    };

    const instance = getClientAuth();
    const unsubscribeAuth = onAuthStateChanged(instance, apply);
    const unsubscribeToken = onIdTokenChanged(instance, apply);

    return () => {
      cancelled = true;
      unsubscribeAuth();
      unsubscribeToken();
    };
  }, []);

  return { data, isPending };
}
