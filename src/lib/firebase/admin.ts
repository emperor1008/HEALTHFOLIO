/**
 * Server-side Firebase Admin SDK — lazy init in the style of the old
 * `getServerSupabase()` (same pattern: create on first use, throw the
 * platform's "not configured" error style, memoize).
 *
 * Credentials come from `FIREBASE_SERVICE_ACCOUNT_KEY` — the service-account
 * JSON as one env string (see .env.example). Server-only: the service account
 * grants project-wide authority and must never reach browser code.
 *
 * NEVER import this from a client component.
 */
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;

function getAdminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "Firebase server environment is not configured: FIREBASE_SERVICE_ACCOUNT_KEY is required (see .env.example)."
    );
  }
  let params: Record<string, string>;
  try {
    params = JSON.parse(raw);
  } catch {
    // Never echo the value — it is a credential.
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON.");
  }
  app = initializeApp({
    credential: cert(params),
    projectId: params.project_id,
  });
  return app;
}

/** Memoized Admin Auth — session cookies, user deletion, user records. */
export function getAdminAuth(): Auth {
  if (adminAuth) return adminAuth;
  adminAuth = getAuth(getAdminApp());
  return adminAuth;
}

/** Memoized Admin Firestore — identity docs and (from P2) all data access. */
export function getAdminDb(): Firestore {
  if (adminDb) return adminDb;
  adminDb = getFirestore(getAdminApp());
  return adminDb;
}

/** True when the server has the minimum env to talk to Firebase. */
export function isFirebaseAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
}
