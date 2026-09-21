import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { getPharmacyMemberships } from "@/lib/pharmacy/roles";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const admin = await createAdminClient();

  // All requests for pharmacies this user is a member of; patients and other
  // pharmacies' data are unreachable (membership check + RLS).
  const memberships = await getPharmacyMemberships(user.id);
  if (memberships.length === 0) {
    return NextResponse.json({ requests: [] });
  }
  const pharmacyIds = memberships.map((m) => m.pharmacyId);

  const { data, error } = await admin
    .from("pharmacy_availability_requests")
    .select(
      "id, patient_id, medicine_label, strength, form, language, status, created_at, updated_at",
    )
    .in("pharmacy_id", pharmacyIds)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // Only the medicine label/strength/form/language/status — never patient
  // identity, records, triage data, or care requests (schema enforces this:
  // the table simply contains no health fields).
  return NextResponse.json({ requests: data ?? [] });
}
