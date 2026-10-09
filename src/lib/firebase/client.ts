/**
 * Browser Firebase app, Auth and Firestore instances — mirrors the old
 * `src/lib/supabase/client.ts` role of "the one obvious place for client
 * call sites".
 *
 * LAZY INITIALIZATION (same constraint as the old `src/lib/auth.ts`): auth
 * pages are prerendered at build time, so the app is created on first USE,
 * never at module import. A missing env therefore never crashes `next build`;
 * at runtime the first auth call fails with Firebase's own `auth/invalid-api-key`.
 *
 * Server components may import this module (SSR-safe): `initializeApp` is a
 * no-op identity operation when no network is involved, and all auth calls
 * live in client components anyway.
 */
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFirebaseWebConfig } from "@/lib/firebase/config";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }
  app = initializeApp(getFirebaseWebConfig());
  return app;
}

/** Memoized browser Auth instance (Firebase Auth SDK). */
export function getClientAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(getFirebaseApp());
  return auth;
}

/**
 * Memoized browser Firestore instance — P1 reads `users/{uid}` identity
 * docs (roles) client-side under the owner-read rules; full data access
 * arrives with P2.
 */
export function getClientDb(): Firestore {
  if (db) return db;
  db = getFirestore(getFirebaseApp());
  return db;
}
