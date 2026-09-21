/**
 * Server-side pharmacy-role resolution (Part 4).
 *
 * Pharmacy roles are NEVER asserted from client input. They live exclusively
 * in `pharmacy_memberships`, written only by the admin-key-guarded API. Every
 * privileged pharmacy request resolves membership here, server-side, per call.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type PharmacyRole = "operator" | "manager";

export interface PharmacyMembership {
  pharmacyId: string;
  role: PharmacyRole;
}

export async function getPharmacyMemberships(
  userId: string,
): Promise<PharmacyMembership[]> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("pharmacy_memberships")
    .select("pharmacy_id, role")
    .eq("user_id", userId);

  if (error) {
    // Never leak DB internals; treat as no access.
    return [];
  }
  return (data ?? []).map((r: { pharmacy_id: string; role: string }) => ({
    pharmacyId: r.pharmacy_id,
    role: r.role as PharmacyRole,
  }));
}

export function canManage(memberships: PharmacyMembership[], pharmacyId: string): boolean {
  return memberships.some((m) => m.pharmacyId === pharmacyId);
}

export function canManageStaff(memberships: PharmacyMembership[], pharmacyId: string): boolean {
  return memberships.some((m) => m.pharmacyId === pharmacyId && m.role === "manager");
}
