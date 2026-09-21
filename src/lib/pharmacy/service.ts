/**
 * Stock-service layer (Part 4). All patient-facing reads go through
 * `getPatientStockView`, which projects ONLY safe fields and applies the
 * freshness policy. Staff reads may include internal fields; the two paths are
 * deliberately separate.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  patientDisplayForEvent,
  DEFAULT_FRESHNESS_POLICY,
  type FreshnessPolicy,
  type PatientStockDisplay,
} from "./freshness";

export interface PatientStockRow {
  pharmacyId: string;
  pharmacyName: string;
  serviceAreaText: string | null;
  languages: string[];
  isOpen: boolean;
  display: PatientStockDisplay;
}

export async function getPatientStockView(
  medicineId: string,
  now: Date = new Date(),
  policy: FreshnessPolicy = DEFAULT_FRESHNESS_POLICY,
): Promise<PatientStockRow[]> {
  const admin = await createAdminClient();

  // Verified pharmacies only; suspended/pending are invisible to patients.
  const { data: pharmacies, error } = await admin
    .from("pharmacies")
    .select("id, name, service_area_text, languages, is_open")
    .eq("verification_state", "verified");

  if (error || !pharmacies) return [];

  const { data: events, error: evErr } = await admin
    .from("pharmacy_stock_events")
    .select("pharmacy_id, medicine_id, status, server_recorded_at")
    .eq("medicine_id", medicineId)
    .order("server_recorded_at", { ascending: false });

  if (evErr) return [];

  // Latest event per pharmacy (deterministic: newest server timestamp wins).
  const latest = new Map<string, { status: string; server_recorded_at: string }>();
  for (const e of events ?? []) {
    if (!latest.has(e.pharmacy_id)) {
      latest.set(e.pharmacy_id, { status: e.status, server_recorded_at: e.server_recorded_at });
    }
  }

  return pharmacies.map((p: { id: string; name: string; service_area_text: string | null; languages: string[]; is_open: boolean }) => ({
    pharmacyId: p.id,
    pharmacyName: p.name,
    serviceAreaText: p.service_area_text,
    languages: p.languages,
    isOpen: p.is_open,
    display: patientDisplayForEvent(latest.get(p.id) ?? null, now, policy),
  }));
}
