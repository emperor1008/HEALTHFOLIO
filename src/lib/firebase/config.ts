/**
 * Firebase web-app configuration — the single place that reads and validates
 * the public Firebase env. Values are `NEXT_PUBLIC_*` so Next.js inlines them
 * into browser bundles; they are public by design (Firebase web config is not
 * a secret) and safe only because P1 ships deny-by-default Firestore rules.
 *
 * Throws the platform's existing "missing env" style error so misconfiguration
 * surfaces at first use, never with secret values in the message.
 */

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

let cached: FirebaseWebConfig | null = null;

export function getFirebaseWebConfig(): FirebaseWebConfig {
  if (cached) return cached;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error(
      "Firebase client environment is not configured: NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, NEXT_PUBLIC_FIREBASE_PROJECT_ID and NEXT_PUBLIC_FIREBASE_APP_ID are required (see .env.example)."
    );
  }
  cached = {
    apiKey,
    authDomain,
    projectId,
    // Storage/messaging are unused until P3/P4 but the console always
    // provides them; fall back to the conventional bucket when absent.
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
    appId,
  };
  return cached;
}

/** True when the public web config is present (never throws). */
export function isFirebaseClientConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  );
}
