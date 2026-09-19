import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth-helpers";
import { StockQuerySchema } from "@/lib/pharmacy/schemas";
import { getPatientStockView } from "@/lib/pharmacy/service";

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const parsed = StockQuerySchema.safeParse({
    medicineId: req.nextUrl.searchParams.get("medicineId") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_medicine" }, { status: 400 });
  }

  // Reuses the safe projection — patients never see internal notes or
  // quantity hints; suspended/pending pharmacies are excluded upstream.
  const rows = await getPatientStockView(parsed.data.medicineId);

  return NextResponse.json({
    results: rows.map((r) => ({
      pharmacyId: r.pharmacyId,
      pharmacyName: r.pharmacyName,
      serviceAreaText: r.serviceAreaText,
      languages: r.languages,
      isOpen: r.isOpen,
      displayStatus: r.display.displayStatus,
      lastConfirmedAt: r.display.lastConfirmedAt,
      freshness: r.display.freshness,
    })),
  });
}
