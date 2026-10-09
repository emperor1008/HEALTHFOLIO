/**
 * Preview identity — the single "current user" that preview mode hands to the
 * application.
 *
 * It is returned by the SAME interface every guard already uses
 * (`getSessionUser()` / `getUser()` / `requireSession()`), so no page, layout
 * or API route needs its own bypass: enabling preview mode changes what the
 * session resolver answers, nothing else.
 *
 * Boundaries:
 *  - Reserved, stable id (`DEMO_USER_ID`) that can never collide with a real
 *    account (RFC 4122 v4 shape, all-zero variant nibble).
 *  - Scoped to synthetic rows: every seeded preview record is owned by this
 *    id, so demo reads/writes can only ever touch preview data.
 *  - Roles come from the server-only `HF_DEMO_ROLES` setting (default:
 *    `patient`). Administrator, staff and clinician consoles stay behind the
 *    normal role guards unless an operator deliberately opts in.
 *  - The identity exists only when the preview gate passes; otherwise this
 *    module returns null and the application falls through to real
 *    authentication.
 */
import { getPreviewGate } from "@/lib/preview/gate";

/** Reserved preview user id — never a real account. */
export const DEMO_USER_ID = "00000000-0000-4000-8000-00000000de00";
export const DEMO_EMAIL = "preview.demo@healthfolio.local";
export const DEMO_NAME = "Preview Demo";

export interface DemoIdentity {
  id: string;
  email: string;
  name: string;
  /** Raw role names; the caller validates them against the app role list. */
  roles: string[];
}

const DEFAULT_ROLES = "patient";

function configuredRoles(): string[] {
  const raw = process.env.HF_DEMO_ROLES ?? DEFAULT_ROLES;
  return raw
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

/**
 * The preview identity for the current request, or null when preview mode is
 * not active (flag off, host not allowlisted, production, …).
 */
export async function getDemoIdentity(): Promise<DemoIdentity | null> {
  const gate = await getPreviewGate();
  if (!gate.enabled) return null;
  return {
    id: DEMO_USER_ID,
    email: DEMO_EMAIL,
    name: DEMO_NAME,
    roles: configuredRoles(),
  };
}

/** True when this user id is the reserved preview identity. */
export function isDemoUserId(userId: string): boolean {
  return userId === DEMO_USER_ID;
}
