/**
 * Staff role resolution — server-side only.
 *
 * Roles live exclusively in `facility_memberships` (written only via the
 * admin-key-guarded API) and are resolved here, on the server, per request.
 * A client can never assert "clinician" or "coordinator".
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type StaffRole = "clinician" | "coordinator";

export interface StaffIdentity {
  userId: string;
  role: StaffRole;
  facilityId: string;
  /** Clinician profile id when role = clinician. */
  clinicianProfileId?: string;
}

/** Resolve the staff identity for a user, or null for patients. */
export async function getStaffIdentity(userId: string): Promise<StaffIdentity | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("facility_memberships")
      .select("role, facility_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      userId,
      role: data.role as StaffRole,
      facilityId: data.facility_id as string,
    };
  } catch {
    return null;
  }
}

/** True when the request carries the correct server-only admin key. */
export function hasStaffAdminKey(req: Request): boolean {
  const expected = process.env.STAFF_ROLE_ADMIN_KEY;
  if (!expected) return false;
  const provided = req.headers.get("x-staff-admin-key");
  return typeof provided === "string" && provided.length > 0 && provided === expected;
}

export const STAFF_ROLE_ERROR = { code: "STAFF_ACCESS_NOT_CONFIGURED" } as const;
