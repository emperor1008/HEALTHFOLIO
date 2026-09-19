"use client";

/**
 * Patient medicine-availability flow (Part 4):
 *   Search → identity confirmation → availability list → request.
 *
 * Honesty rules enforced here:
 * - No fabricated pharmacies or stock rows; empty states are real empties.
 * - The patient's query is never rewritten; a match must be explicitly chosen.
 * - Every result shows pharmacy name + last-confirmed timestamp + freshness.
 * - Offline requests queue through the existing engine and say so truthfully.
 */

import { useCallback, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { getPart4Dict } from "@/lib/i18n/part4";
import { useSync } from "@/lib/offline/sync-provider";
import { searchMedicineSafe, medicineDisplayLabel, SUGGESTION_THRESHOLD, type MedicineCandidate } from "@/lib/pharmacy/medicine-search";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface AvailabilityRow {
  pharmacyId: string;
  pharmacyName: string;
  serviceAreaText: string | null;
  languages: string[];
  isOpen: boolean;
  displayStatus:
    | "available"
    | "low_stock"
    | "unavailable"
    | "not_stocked"
    | "not_recently_confirmed"
    | "no_update";
  lastConfirmedAt: string | null;
  freshness: "fresh" | "aging" | "stale" | "expired";
}

interface MyRequest {
  id: string;
  pharmacy_id: string;
  medicine_label: string;
  strength: string | null;
  form: string | null;
  status: string;
  created_at: string;
  pharmacy_availability_responses?: Array<{
    response: string;
    note_for_patient: string | null;
    created_at: string;
  }> | null;
}

function formatTimestamp(iso: string | null, lang: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(lang === "or" ? "or-IN" : lang === "hi" ? "hi-IN" : "en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type View = "search" | "results" | "requests";

export default function PharmacyFinderClient() {
  const { language } = useLanguage();
  const t = getPart4Dict(language);
  const { online, enqueuePharmacyAvailabilityRequest, items } = useSync();

  const [view, setView] = useState<View>("search");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selected, setSelected] = useState<MedicineCandidate | null>(null);
  const [rejected, setRejected] = useState(false);
  const [rows, setRows] = useState<AvailabilityRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestState, setRequestState] = useState<Record<string, "saved" | "sent">>({});
  const [savedRequestPharmacy, setSavedRequestPharmacy] = useState<string | null>(null);

  const outcome = useMemo(
    () => (submittedQuery ? searchMedicineSafe(submittedQuery) : null),
    [submittedQuery],
  );

  const pendingPharmacyCount = useMemo(() => {
    const ids = new Set(
      items
        .filter((i) => i.actionType === "pharmacy.availability_request" && i.state === "pending")
        .map((i) => (i.payload as { pharmacyId?: string }).pharmacyId),
    );
    return ids.size;
  }, [items]);

  const loadMyRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/pharmacy/requests");
      if (!res.ok) return;
      const data = (await res.json()) as { requests?: MyRequest[] };
      setMyRequests(data.requests ?? []);
    } catch {
      /* offline: keep whatever we have; queue state is shown separately */
    }
  }, []);

  const [myRequests, setMyRequests] = useState<MyRequest[]>([]);

  const openRequests = useCallback(() => {
    setView("requests");
    void loadMyRequests();
  }, [loadMyRequests]);

  const doSearch = useCallback(() => {
    if (!query.trim()) return;
    setSubmittedQuery(query.trim());
    setSelected(null);
    setRejected(false);
    setRows(null);
    setView("results");
  }, [query]);

  const chooseCandidate = useCallback((c: MedicineCandidate) => {
    setSelected(c);
    setRejected(false);
    setLoading(true);
    fetch(`/api/pharmacy/stock/patient-lookup?medicineId=${encodeURIComponent(c.medicineId)}`)
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data: { results?: AvailabilityRow[] }) => {
        setRows(data.results ?? []);
        setLoading(false);
      })
      .catch(() => {
        setRows([]);
        setLoading(false);
      });
  }, []);

  const requestConfirmation = useCallback(
    async (row: AvailabilityRow) => {
      const med = selected;
      if (!med) return;
      const item = await enqueuePharmacyAvailabilityRequest({
        pharmacyId: row.pharmacyId,
        medicineId: med.medicineId,
        medicineLabel: medicineDisplayLabel(med),
        strength: med.strength,
        form: med.doseForm,
        language,
      });
      // Truthful state: sent only when the item synced; otherwise saved locally.
      setRequestState((s) => ({ ...s, [row.pharmacyId]: item.state === "synced" ? "sent" : "saved" }));
      setSavedRequestPharmacy(row.pharmacyId);
    },
    [selected, enqueuePharmacyAvailabilityRequest, language],
  );

  const statusLabel = useCallback(
    (row: AvailabilityRow): { text: string; tone: "positive" | "warning" | "danger" | "neutral" } => {
      switch (row.displayStatus) {
        case "available":
          return { text: t.reportedAvailable, tone: "positive" };
        case "low_stock":
          return { text: t.limitedStock, tone: "warning" };
        case "unavailable":
          return { text: t.reportedUnavailable, tone: "danger" };
        case "not_stocked":
          return { text: t.notStocked, tone: "neutral" };
        case "not_recently_confirmed":
          return { text: t.notRecentlyConfirmed, tone: "warning" };
        default:
          return { text: t.noUpdateAvailable, tone: "neutral" };
      }
    },
    [t],
  );

  const freshnessNote = useCallback(
    (row: AvailabilityRow): string | null => {
      if (row.freshness === "aging" && row.displayStatus === "available") {
        return t.freshnessAging;
      }
      if (row.displayStatus === "not_recently_confirmed") {
        return t.notRecentlyConfirmed;
      }
      return null;
    },
    [t],
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6">
      <h1 className="text-2xl font-semibold text-forest-900">{t.findMedicine}</h1>

      {/* View switch */}
      <div className="mt-4 flex gap-2" role="tablist" aria-label={t.findMedicine}>
        <Button variant={view === "search" || view === "results" ? "primary" : "secondary"} onClick={() => setView("search")}>
          {t.findMedicine}
        </Button>
        <Button variant={view === "requests" ? "primary" : "secondary"} onClick={openRequests}>
          {t.myRequests}
          {pendingPharmacyCount > 0 ? ` (${pendingPharmacyCount})` : ""}
        </Button>
      </div>

      {!online && (
        <p role="status" className="mt-4 rounded-md bg-sage-50 px-4 py-3 text-sm text-forest-900">
          {t.statusOffline}
        </p>
      )}

      {view === "search" && (
        <Card className="mt-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doSearch();
            }}
            className="flex flex-col gap-3"
          >
            <label htmlFor="medicine-query" className="text-sm font-medium text-forest-900">
              {t.searchPlaceholder}
            </label>
            <input
              id="medicine-query"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="min-h-11 w-full rounded-md border border-forest-200 bg-white px-3 py-2 text-base"
              autoComplete="off"
            />
            <Button type="submit" disabled={!query.trim()}>
              {t.search}
            </Button>
          </form>
        </Card>
      )}

      {view === "results" && outcome && (
        <>
          <Card className="mt-4">
            <p className="text-sm text-forest-700">
              <span className="font-medium">{t.search}:</span>{" "}
              <span aria-hidden="false">{outcome.originalQuery}</span>
            </p>

            {/* Identity confirmation — nothing is substituted silently */}
            {outcome.candidates.length === 0 && (
              <p className="mt-2 text-sm">{t.noResultsForMedicine}</p>
            )}

            {outcome.candidates.length > 0 && !selected && !rejected && (
              <div className="mt-3 space-y-3">
                {outcome.suggestionAvailable && (
                  <p className="text-sm text-forest-700">
                    {t.didYouMean} <strong>{medicineDisplayLabel(outcome.candidates[0])}</strong>?
                  </p>
                )}
                <ul className="space-y-2">
                  {outcome.candidates.map((c) => (
                    <li key={c.medicineId} className="rounded-md border border-forest-100 p-3">
                      <p className="font-medium text-forest-900">{medicineDisplayLabel(c)}</p>
                      {c.genericName && (
                        <p className="text-sm text-forest-700">
                          {t.identityGeneric}: {c.genericName}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button onClick={() => chooseCandidate(c)} disabled={c.confidence < SUGGESTION_THRESHOLD * 0.8}>
                          {t.useThisMatch}
                        </Button>
                        <Button variant="secondary" onClick={() => setRejected(true)}>
                          {t.notWhatIWant}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {rejected && !selected && (
              <p className="mt-3 rounded-md bg-sage-50 px-3 py-2 text-sm">
                {/* Honest: we do not guess. The user keeps their own spelling. */}
                {t.identityKeepOriginal}. {t.noResultsForMedicine}
              </p>
            )}
          </Card>

          {selected && (
            <section aria-label={t.availabilityResults} className="mt-4 space-y-3">
              <h2 className="text-lg font-semibold text-forest-900">{t.availabilityResults}</h2>
              {loading && <p role="status">{t.statusSyncing}…</p>}
              {!loading && rows && rows.length === 0 && <Card>{t.noPharmacies}</Card>}
              {!loading &&
                rows &&
                rows.map((row) => {
                  const st = statusLabel(row);
                  const fn = freshnessNote(row);
                  const reqState = requestState[row.pharmacyId];
                  const queuedOffline = !online && savedRequestPharmacy === row.pharmacyId;
                  return (
                    <Card key={row.pharmacyId}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-forest-900">{row.pharmacyName}</p>
                          {row.serviceAreaText && (
                            <p className="text-sm text-forest-700">{row.serviceAreaText}</p>
                          )}
                        </div>
                        <Badge variant={st.tone === "positive" ? "verified" : st.tone === "warning" ? "review" : st.tone === "danger" ? "failed" : "excluded"}>
                          {st.text}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-forest-700">
                        {t.lastConfirmed}: {formatTimestamp(row.lastConfirmedAt, language)}
                      </p>
                      {fn && <p className="mt-1 text-sm text-terracotta-700">{fn}</p>}
                      <p className="mt-2 text-xs text-forest-600">{t.contactBeforeTravelling}</p>

                      <div className="mt-3">
                        {reqState === "sent" ? (
                          <Badge variant="verified">{t.requestSent}</Badge>
                        ) : reqState === "saved" || queuedOffline ? (
                          <Badge variant="review">{t.statusSaved} — {t.statusWaiting}</Badge>
                        ) : (
                          <Button onClick={() => void requestConfirmation(row)}>{t.requestConfirmation}</Button>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-forest-600">{t.nonBindingNote}</p>
                    </Card>
                  );
                })}
              <p className="text-xs text-forest-600">{t.notMedicalAdvice}</p>
            </section>
          )}
        </>
      )}

      {view === "requests" && (
        <section aria-label={t.myRequests} className="mt-4 space-y-3">
          <h2 className="text-lg font-semibold text-forest-900">{t.myRequests}</h2>
          {myRequests.length === 0 && pendingPharmacyCount === 0 && (
            <Card>
              <p className="text-sm">{t.noResultsForMedicine}</p>
            </Card>
          )}
          {myRequests.map((r) => {
            const resp = r.pharmacy_availability_responses?.[0];
            return (
              <Card key={r.id}>
                <p className="font-medium text-forest-900">
                  {r.medicine_label}
                  {r.strength ? ` ${r.strength}` : ""}
                </p>
                <p className="text-sm text-forest-700">{t.lastConfirmed}: {formatTimestamp(r.created_at, language)}</p>
                {resp ? (
                  <>
                    <p className="mt-1 text-sm font-medium text-forest-900">{t.requestResponded}</p>
                    <Badge
                      variant={
                        resp.response === "confirmed_available"
                          ? "verified"
                          : resp.response === "limited"
                            ? "review"
                            : resp.response === "unavailable"
                              ? "failed"
                              : "excluded"
                      }
                    >
                      {resp.response === "confirmed_available"
                        ? t.responseConfirmed
                        : resp.response === "limited"
                          ? t.responseLimited
                          : resp.response === "unavailable"
                            ? t.responseUnavailable
                            : t.responseCannotConfirm}
                    </Badge>
                  </>
                ) : (
                  <Badge variant={r.status === "pending" ? "review" : "excluded"}>
                    {r.status === "pending" ? t.requestPending : t.requestCancelled}
                  </Badge>
                )}
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
