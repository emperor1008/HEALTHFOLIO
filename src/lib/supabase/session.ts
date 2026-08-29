/**
 * Centralized anonymous session management.
 *
 * Ensures signInAnonymously() is called at most once per page lifecycle,
 * even under React Strict Mode or concurrent renders.
 */

import { createClient } from "./browser";

let pendingSession: Promise<{ id: string; email: string } | null> | null = null;

/**
 * Get or create an anonymous Supabase session.
 * Returns the authenticated user or null on failure.
 * Uses a shared Promise to prevent duplicate calls.
 */
export async function ensureAnonymousSession(): Promise<{
  id: string;
  email: string;
} | null> {
  // If a session creation is already in progress, reuse it
  if (pendingSession) {
    return pendingSession;
  }

  pendingSession = createSessionInternal();

  try {
    return await pendingSession;
  } finally {
    pendingSession = null;
  }
}

async function createSessionInternal(): Promise<{
  id: string;
  email: string;
} | null> {
  try {
    const supabase = createClient();

    // Check for existing session first
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.user) {
      return { id: session.user.id, email: session.user.email ?? "" };
    }

    // Create anonymous session
    const { data, error } = await supabase.auth.signInAnonymously();

    if (error || !data.user) {
      console.error("Anonymous sign-in failed:", error);
      return null;
    }

    return { id: data.user.id, email: data.user.email ?? "" };
  } catch (err) {
    console.error("Session creation error:", err);
    return null;
  }
}
