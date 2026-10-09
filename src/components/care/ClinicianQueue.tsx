"use client";

/**
 * Clinician queue (Phase 1) — assigned + unassigned care requests, with the
 * actions that lead to a real consultation:
 *
 *   take request (assign) → propose appointment → patient confirms →
 *   join /consultations/[id]
 *
 * Every state shown here is real server data (GET /api/clinician/care-requests);
 * empty queues say so plainly — no demo rows, no invented activity.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/language-context";
import { t3 } from "@/lib/i18n/part3";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface AssignedItem {
  careRequestId: string;
  assignmentState: string;
  reason: string | null;
  triageCategory: string | null;
  createdAt: string | null;
  appointment: {
    id: string;
    state: string;
    mode: string;
    proposedStartsAt: string | null;
  } | null;
}

interface AvailableItem {
  careRequestId: string;
  reason: string | null;
  triageCategory: string | null;
  createdAt: string;
}

interface QueueResponse {
  profileId?: string;
  assigned: AssignedItem[];
  available: AvailableItem[];
}

const JOINABLE_STATES = new Set(["appointment_confirmed", "in_consultation"]);

function defaultProposalTime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ClinicianQueue() {
  const { language, t } = useLanguage();
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // One inline propose form per request id.
  const [proposalMode, setProposalMode] = useState<Record<string, "text" | "audio" | "video">>({});
  const [proposalTime, setProposalTime] = useState<Record<string, string>>({});

  const tt = useCallback(
    (key: Parameters<typeof t3>[1], vars?: Record<string, string | number>) => t3(language, key, vars),
    [language]
  );

  const load = useCallback(() => {
    fetch("/api/clinician/care-requests")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load_failed"))))
      .then((json: QueueResponse) => {
        setData({ profileId: json.profileId, assigned: json.assigned ?? [], available: json.available ?? [] });
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const takeRequest = useCallback(
    async (careRequestId: string) => {
      if (!data?.profileId) {
        setActionError(tt("errorGeneric"));
        return;
      }
      setBusyId(careRequestId);
      setActionError(null);
      try {
        const res = await fetch(`/api/care-requests/${careRequestId}/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clinician_profile_id: data.profileId }),
        });
        if (!res.ok) throw new Error("assign_failed");
        load();
      } catch {
        setActionError(tt("errorGeneric"));
      } finally {
        setBusyId(null);
      }
    },
    [data, load, tt]
  );

  const proposeAppointment = useCallback(
    async (careRequestId: string) => {
      const mode = proposalMode[careRequestId] ?? "video";
      const local = proposalTime[careRequestId] ?? defaultProposalTime();
      setBusyId(careRequestId);
      setActionError(null);
      try {
        const res = await fetch("/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            care_request_id: careRequestId,
            mode,
            starts_at: new Date(local).toISOString(),
          }),
        });
        if (!res.ok) throw new Error("propose_failed");
        load();
      } catch {
        setActionError(tt("errorGeneric"));
      } finally {
        setBusyId(null);
      }
    },
    [proposalMode, proposalTime, load, tt]
  );

  if (loadFailed) {
    return (
      <Card padding="md" className="mt-4">
        <p role="status" className="text-sm text-text-secondary">
          {tt("errLoadFailed")}
        </p>
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {actionError && (
        <p role="alert" className="rounded-card bg-[#F7E9E4] p-3 text-sm text-[#8A4B32]">
          {actionError}
        </p>
      )}

      {/* ── Assigned ─────────────────────────────────────────────────── */}
      <Card padding="md">
        <p className="font-medium text-text-primary">{tt("assignedQueue")}</p>
        {data === null && <p className="mt-2 text-sm text-text-secondary">…</p>}
        {data !== null && data.assigned.length === 0 && (
          <p className="mt-2 text-sm text-text-secondary">{tt("queueEmpty")}</p>
        )}
        <ul className="mt-3 space-y-3">
          {(data?.assigned ?? []).map((item) => (
            <li key={item.careRequestId} className="rounded-card border border-border bg-surface p-3">
              <p className="text-sm text-text-primary">{item.reason ?? "…"}</p>
              <p className="mt-1 text-xs text-text-secondary">
                {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                {item.triageCategory ? ` · ${item.triageCategory}` : ""}
              </p>

              {item.appointment && JOINABLE_STATES.has(item.appointment.state) && (
                <div className="mt-2">
                  <Link
                    href={`/consultations/${item.appointment.id}`}
                    className="inline-flex min-h-[36px] items-center rounded-card bg-primary px-4 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {tt("joinConsultation")}
                  </Link>
                </div>
              )}

              {item.appointment?.state === "appointment_proposed" && (
                <p className="mt-2 text-xs text-text-secondary">
                  {tt("statusProposed")}
                  {item.appointment.proposedStartsAt
                    ? ` · ${tt("proposedTime")}: ${new Date(item.appointment.proposedStartsAt).toLocaleString()}`
                    : ""}
                </p>
              )}

              {!item.appointment && (
                <div className="mt-3 rounded-card bg-canvas p-3">
                  <label className="block text-xs font-medium text-text-secondary" htmlFor={`mode-${item.careRequestId}`}>
                    {tt("proposeAppointment")}
                  </label>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      id={`mode-${item.careRequestId}`}
                      value={proposalMode[item.careRequestId] ?? "video"}
                      onChange={(e) =>
                        setProposalMode((m) => ({
                          ...m,
                          [item.careRequestId]: e.target.value as "text" | "audio" | "video",
                        }))
                      }
                      className="min-h-[36px] rounded-card border border-border bg-surface px-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <option value="video">{tt("modeVideo")}</option>
                      <option value="audio">{tt("modeAudio")}</option>
                      <option value="text">{tt("modeText")}</option>
                    </select>
                    <input
                      type="datetime-local"
                      aria-label={tt("proposedTime")}
                      value={proposalTime[item.careRequestId] ?? defaultProposalTime()}
                      onChange={(e) =>
                        setProposalTime((p) => ({ ...p, [item.careRequestId]: e.target.value }))
                      }
                      className="min-h-[36px] rounded-card border border-border bg-surface px-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <Button
                      size="sm"
                      disabled={busyId === item.careRequestId}
                      onClick={() => void proposeAppointment(item.careRequestId)}
                    >
                      {tt("proposeAppointment")}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {/* ── Available ────────────────────────────────────────────────── */}
      <Card padding="md">
        <p className="font-medium text-text-primary">{tt("unassignedQueue")}</p>
        {data !== null && data.available.length === 0 && (
          <p className="mt-2 text-sm text-text-secondary">{tt("queueEmpty")}</p>
        )}
        <ul className="mt-3 space-y-3">
          {(data?.available ?? []).map((item) => (
            <li key={item.careRequestId} className="rounded-card border border-border bg-surface p-3">
              <p className="text-sm text-text-primary">{item.reason ?? "…"}</p>
              <p className="mt-1 text-xs text-text-secondary">
                {new Date(item.createdAt).toLocaleString()}
                {item.triageCategory ? ` · ${item.triageCategory}` : ""}
              </p>
              <div className="mt-2">
                <Button
                  size="sm"
                  disabled={busyId === item.careRequestId}
                  onClick={() => void takeRequest(item.careRequestId)}
                >
                  {tt("actionTakeRequest")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {data !== null && data.available.length === 0 && (
          <p className="mt-2 text-xs text-text-secondary">{t("notMedicalAdvice")}</p>
        )}
      </Card>
    </div>
  );
}
