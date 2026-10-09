/**
 * Redirect allowlisting for post-authentication navigation.
 *
 * Only same-origin, relative, non-protocol-relative paths are honored.
 * Everything else (absolute URLs, protocol-relative "//evil.com", backslash
 * tricks, API routes, and the platform-admin area) falls back to the server
 * role router — clients can never steer authentication flows off-origin.
 */
export function sanitizeRedirect(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  if (raw.startsWith("/api/") || raw.startsWith("/admin/platform")) return null;
  return raw;
}
