import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { getPharmacyMemberships } from "@/lib/pharmacy/roles";
import { getMetricSummary } from "@/lib/metrics/service";
import { METRIC_DEFINITIONS } from "@/lib/metrics/events";
import { getStaffIdentity } from "@/lib/staff/roles";

/**
 * Protected reliability-metrics dashboard API. Read access requires a real
 * staff identity (clinician/coordinator membership) or pharmacy membership —
 * resolved server-side; ordinary patient sessions are refused.
 */
export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const [staff, pharmacyMemberships] = await Promise.all([
    getStaffIdentity(user.id),
    getPharmacyMemberships(user.id),
  ]);

  const isStaff = Boolean(staff);
  const isPharmacyStaff = pharmacyMemberships.length > 0;

  if (!isStaff && !isPharmacyStaff) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const summary = await getMetricSummary();
  return NextResponse.json({
    summary,
    definitions: METRIC_DEFINITIONS,
    generatedAt: new Date().toISOString(),
  });
}
