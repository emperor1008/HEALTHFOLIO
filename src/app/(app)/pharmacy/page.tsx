"use client";

/**
 * Pharmacy operator console (Part 4).
 *
 * Only real members see real data. Every update is truthful about its sync
 * state; quantities/notes are never shown to patients unless explicitly
 * enabled. No fabricated stock rows.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { getPart4Dict } from "@/lib/i18n/part4";
import { useSync } from "@/lib/offline/sync-provider";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface InboxRequest {
  id: string;
  medicine_label: string;
  strength: string | null;
  form: string | null;
  language: string;
  status: string;
  created_at: string;
}

interface RecentEvent {
  id: string;
  medicine_id: string;
  medicine_label: string;
  status: string;
  quantity_hint: number | null;
  show_quantity_to_patients: boolean;
  internal_note: string | null;
  server_recorded_at: string;
}

const STATUS_OPTIONS = ["available", "low_stock", "unavailable", "not_stocked"] as const;
type StatusOption = (typeof STATUS_OPTIONS)[number];

export default function PharmacyConsoleClient() {
  const { language } = useLanguage();
  const t = getPart4Dict(language);
  const { online, enqueuePharmacyStockUpdate, enqueuePharmacyAvailabilityResponse, items } = useSync();

  const [pharmacyId, setPharmacyId] = useState<string | null>(null);
  const [noMembership, setNoMembership] = useState(false);
  const [medicineId, setMedicineId] = useState("");
  const [medicineLabel, setMedicineLabel] = useState("");
  const [status, setStatus] = useState<StatusOption>("available");
  const [quantity, setQuantity] = useState("");
  const [showQty, setShowQty] = useState(false);
  const [note, setNote] = useState("");
  const [lastSaved, setLastSaved] = useState<"saved" | "sent" | null>(null);
  const [inbox, setInbox] = useState<InboxRequest[]>([]);
  const [recent, setRecent] = useState<RecentEvent[]>([]);

  const pendingCount = useMemo(
    () =>
      items.filter(
        (i) =>
          i.actionType.startsWith("pharmacy.") &&
          (i.state === "pending" || i.state === "syncing"),
      ).length,
    [items],
  );

  useEffect(() => {
    let alive = true;
    // Discover membership via the stock GET (403 means no membership).
    fetch("/api/pharmacy/stock?pharmacyId=me")
      .then(async (r) => {
        if (r.status === 403 || r.status === 401) {
          if (alive) setNoMembership(true);
          return null;
        }
        if (!r.ok) return null;
        const data = (await r.json()) as { events?: RecentEvent[]; pharmacyId?: string };
        if (alive) {
          setPharmacyId(data.pharmacyId ?? "me");
          setRecent(data.events ?? []);
        }
        return data;
      })
      .then(() => {
        fetch("/api/pharmacy/requests/inbox")
          .then((r) => (r.ok ? r.json() : { requests: [] }))
          .then((d: { requests?: InboxRequest[] }) => {
            if (alive) setInbox(d.requests ?? []);
          })
          .catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async () => {
    if (!medicineId.trim() || !medicineLabel.trim()) return;
    const item = await enqueuePharmacyStockUpdate({
      pharmacyId: pharmacyId ?? "me",
      medicineId: medicineId.trim(),
      medicineLabel: medicineLabel.trim(),
      status,
      quantityHint: quantity ? Number.parseInt(quantity, 10) : null,
      showQuantityToPatients: showQty,
      internalNote: note || null,
    });
    setLastSaved(item.state === "synced" ? "sent" : "saved");
    setMedicineId("");
    setMedicineLabel("");
    setQuantity("");
    setNote("");
    setShowQty(false);
  }, [medicineId, medicineLabel, status, quantity, showQty, note, pharmacyId, enqueuePharmacyStockUpdate]);

  const respond = useCallback(
    async (req: InboxRequest, response: "confirmed_available" | "limited" | "unavailable" | "cannot_confirm_now") => {
      await enqueuePharmacyAvailabilityResponse({ requestId: req.id, response, noteForPatient: null });
      setInbox((prev) => prev.filter((r) => r.id !== req.id));
    },
    [enqueuePharmacyAvailabilityResponse],
  );

  if (noMembership) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
        <h1 className="text-2xl font-semibold text-forest-900">{t.pharmacyConsole}</h1>
        <Card className="mt-4">
          <p className="text-sm text-forest-800">{t.noMembership}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
      <h1 className="text-2xl font-semibold text-forest-900">{t.pharmacyConsole}</h1>

      {!online && (
        <p role="status" className="mt-3 rounded-md bg-sage-50 px-4 py-3 text-sm text-forest-900">
          {t.statusOffline}
        </p>
      )}
      {pendingCount > 0 && (
        <p className="mt-2 text-sm text-forest-700">
          {t.statusWaiting}: {pendingCount}
        </p>
      )}

      {/* Update stock */}
      <Card className="mt-4">
        <h2 className="text-lg font-semibold text-forest-900">{t.updateStock}</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="med-id" className="text-sm font-medium text-forest-900">
              Medicine ID
            </label>
            <input
              id="med-id"
              value={medicineId}
              onChange={(e) => setMedicineId(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-forest-200 px-3 py-2"
              placeholder="rxnorm:161"
            />
          </div>
          <div>
            <label htmlFor="med-label" className="text-sm font-medium text-forest-900">
              Medicine name
            </label>
            <input
              id="med-label"
              value={medicineLabel}
              onChange={(e) => setMedicineLabel(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-forest-200 px-3 py-2"
            />
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-forest-900">Status</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((s) => (
                <Button
                  key={s}
                  variant={status === s ? "primary" : "secondary"}
                  onClick={() => setStatus(s)}
                  aria-pressed={status === s}
                  className="min-h-11"
                >
                  {s === "available" ? t.available : s === "low_stock" ? t.lowStock : s === "unavailable" ? t.unavailable : t.notStockedLabel}
                </Button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="qty" className="text-sm font-medium text-forest-900">
              {t.quantityLabel}
            </label>
            <input
              id="qty"
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-forest-200 px-3 py-2"
            />
            <label className="mt-2 flex items-center gap-2 text-sm text-forest-800">
              <input type="checkbox" checked={showQty} onChange={(e) => setShowQty(e.target.checked)} />
              Show quantity to patients
            </label>
            <p className="text-xs text-forest-600">{t.quantityNeverShown}</p>
          </div>
          <div>
            <label htmlFor="note" className="text-sm font-medium text-forest-900">
              {t.internalNoteLabel}
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              className="mt-1 w-full rounded-md border border-forest-200 px-3 py-2"
            />
            <p className="text-xs text-forest-600">{t.internalNoteHint}</p>
          </div>
          <Button onClick={() => void save()} disabled={!medicineId.trim() || !medicineLabel.trim()}>
            {t.saveUpdate}
          </Button>
          {lastSaved === "saved" && (
            <Badge variant="review">
              {t.statusSaved} — {t.statusWaiting}
            </Badge>
          )}
          {lastSaved === "sent" && <Badge variant="verified">{t.statusUpdated}</Badge>}
        </div>
      </Card>

      {/* Requests needing response */}
      <Card className="mt-4">
        <h2 className="text-lg font-semibold text-forest-900">{t.requestsToAnswer}</h2>
        {inbox.length === 0 ? (
          <p className="mt-2 text-sm text-forest-700">{t.noResultsForMedicine}</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {inbox.map((r) => (
              <li key={r.id} className="rounded-md border border-forest-100 p-3">
                <p className="font-medium text-forest-900">
                  {r.medicine_label}
                  {r.strength ? ` ${r.strength}` : ""}
                </p>
                <p className="text-xs text-forest-600">{r.language}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button onClick={() => void respond(r, "confirmed_available")}>{t.responseConfirmed}</Button>
                  <Button variant="secondary" onClick={() => void respond(r, "limited")}>
                    {t.responseLimited}
                  </Button>
                  <Button variant="secondary" onClick={() => void respond(r, "unavailable")}>
                    {t.responseUnavailable}
                  </Button>
                  <Button variant="secondary" onClick={() => void respond(r, "cannot_confirm_now")}>
                    {t.responseCannotConfirm}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Recent updates */}
      <Card className="mt-4">
        <h2 className="text-lg font-semibold text-forest-900">{t.recentUpdates}</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-forest-700">{t.noResultsForMedicine}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {recent.slice(0, 10).map((ev) => (
              <li key={ev.id} className="flex items-center justify-between rounded-md border border-forest-100 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-forest-900">{ev.medicine_label}</p>
                  <p className="text-xs text-forest-600">
                    {new Date(ev.server_recorded_at).toLocaleString(
                      language === "or" ? "or-IN" : language === "hi" ? "hi-IN" : "en-IN",
                    )}
                  </p>
                </div>
                <Badge
                  variant={
                    ev.status === "available" ? "verified" : ev.status === "low_stock" ? "review" : ev.status === "unavailable" ? "failed" : "excluded"
                  }
                >
                  {ev.status === "available" ? t.available : ev.status === "low_stock" ? t.lowStock : ev.status === "unavailable" ? t.unavailable : t.notStockedLabel}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
