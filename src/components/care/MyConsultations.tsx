"use client";

/**
 * My consultations (Phase 1) — the patient entry point to the live
 * consultation room.
 *
 * - Loads ONLY the patient's own appointments (GET /api/appointments).
 * - appointment_proposed → the patient confirms it themselves (existing
 *   validated lifecycle; nothing is booked without the patient).
 * - appointment_confirmed / in_consultation → a real link into
 *   /consultations/[id] (the server re-authorizes on every session load).
 * - Offline: shows an honest note and invents nothing.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/language-context";
import { t3 } from "@/lib/i18n/part3";
import { useSync } from "@/lib/offline/sync-provider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface AppointmentRow {
  id: string;
  care_request_id: string | null;
  state: string;
  mode: string;
  proposed_starts_at: string | null;
  confirmed_starts_at: string | null;
  updated_at: string;
}

const JOINABLE_STATES = new Set(["appointment_confirmed", "in_consultation"]);

function stateLabelKey(
  state: string
): Parameters<typeof t3>[1] {
  switch (state) {
    case "appointment_proposed":
      return "statusProposed";
    case "appointment_confirmed":
      return "statusConfirmed";
    case "in_consultation":
      return "statusInConsultation";
    case "completed":
      return "statusCompleted";
    case "cancelled":
    case "declined_by_patient":
    case "declined_by_clinician":
      return "statusCancelled";
    default:
      return "statusAwaitingReview";
  }
}

export function MyConsultations() {
  const { language } = useLanguage();
  const sync = useSync();
  const [rows, setRows] = useState<AppointmentRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const tt = useCallback(
    (key: Parameters<typeof t3>[1], vars?: Record<string, string | number>) => t3(language, key, vars),
    [language]
  );

  const load = useCallback(() => {
    fetch("/api/appointments")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load_failed"))))
      .then((data: { appointments?: AppointmentRow[] }) => {
        setRows(data.appointments ?? []);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(() => {
    if (sync.online) load();
  }, [sync.online, load]);

  const confirmAppointment = useCallback(
    async (id: string) => {
      setConfirmingId(id);
      setActionError(null);
      try {
        const res = await fetch(`/api/appointments/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: "appointment_confirmed" }),
        });
        if (!res.ok) throw new Error("confirm_failed");
        load();
      } catch {
        setActionError(tt("errorGeneric"));
      } finally {
        setConfirmingId(null);
      }
    },
    [load, tt]
  );

  if (!sync.online) {
    return (
      <Card padding="md" className="mt-6">
        <p className="font-medium text-text-primary">{tt("myConsultations")}</p>
        <p className="mt-1 text-sm text-text-secondary">{tt("consultOfflineSaved")}</p>
      </Card>
    );
  }

  return (
    <Card padding="md" className="mt-6">
      <p className="font-medium text-text-primary">{tt("myConsultations")}</p>

      {rows === null && !loadFailed && <p className="mt-2 text-sm text-text-secondary">…</p>}
      {loadFailed && (
        <p role="status" className="mt-2 text-sm text-text-secondary">
          {tt("errLoadFailed")}
        </p>
      )}
      {rows !== null && rows.length === 0 && (
        <p className="mt-2 text-sm text-text-secondary">{tt("noConsultations")}</p>
      )}

      {actionError && (
        <p role="alert" className="mt-2 text-sm text-[#8A4B32]">
          {actionError}
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {(rows ?? []).map((a) => (
          <li key={a.id} className="rounded-card border border-border bg-surface p-3">
            <p className="text-sm font-medium text-text-primary">{tt(stateLabelKey(a.state))}</p>
            {(a.proposed_starts_at || a.confirmed_starts_at) && (
              <p className="mt-1 text-xs text-text-secondary">
                {tt("proposedTime")}:{" "}
                {new Date(a.confirmed_starts_at ?? a.proposed_starts_at ?? "").toLocaleString()}
              </p>
            )}
            <p className="mt-1 text-xs text-text-secondary">{tt(modeLabelKey(a.mode))}</p>

            <div className="mt-2 flex flex-wrap gap-2">
              {a.state === "appointment_proposed" && (
                <Button
                  size="sm"
                  disabled={confirmingId === a.id}
                  onClick={() => void confirmAppointment(a.id)}
                >
                  {tt("confirmAppointment")}
                </Button>
              )}
              {JOINABLE_STATES.has(a.state) && (
                <Link
                  href={`/consultations/${a.id}`}
                  className="inline-flex min-h-[36px] items-center rounded-card bg-primary px-4 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {tt("joinConsultation")}
                </Link>
              )}
            </div>
            {a.state === "appointment_proposed" && (
              <p className="mt-2 text-xs text-text-secondary">{tt("patientAckNote")}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function modeLabelKey(mode: string): Parameters<typeof t3>[1] {
  if (mode === "video") return "modeVideo";
  if (mode === "audio") return "modeAudio";
  return "modeText";
}
