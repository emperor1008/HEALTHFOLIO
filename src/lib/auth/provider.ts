/**
 * Authentication provider selection.
 *
 * The application supports two providers behind ONE session resolver
 * (`getSessionUser()`):
 *
 *   database  — accounts and sessions in ordinary tables (src/lib/auth/db-auth).
 *               This is the default whenever Firebase is not configured, which
 *               is what makes local development and preview work without an
 *               external identity service.
 *   firebase   — the existing production provider, unchanged.
 *
 * Selection is server-side configuration only:
 *   HF_AUTH_PROVIDER=db | firebase   (optional override)
 * otherwise: database when Firebase admin credentials are absent, else
 * Firebase. No browser variable is ever consulted.
 */
import { isFirebaseAdminConfigured } from "@/lib/firebase/admin";

export type AuthProvider = "database" | "firebase";

export function authProvider(): AuthProvider {
  const explicit = (process.env.HF_AUTH_PROVIDER ?? "").trim().toLowerCase();
  if (explicit === "db" || explicit === "database") return "database";
  if (explicit === "firebase") return "firebase";
  try {
    return isFirebaseAdminConfigured() ? "firebase" : "database";
  } catch {
    return "database";
  }
}

export function isDatabaseAuth(): boolean {
  return authProvider() === "database";
}
