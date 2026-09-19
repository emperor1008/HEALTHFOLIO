"use client";

/**
 * Care-request history (Part 2) — extracted from the hub page so the page
 * module keeps only the Next.js-permitted exports. Also imported directly
 * by tests/unit/audit-regressions.test.tsx.
 */

import { useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { t2 } from "@/lib/i18n/part2";
import { useSync } from "@/lib/offline/sync-provider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { JourneyStatus } from "@/components/journey/JourneyStatus";
import { deriveJourney } from "@/lib/journey/status";

interface ServerCareRequest {
  id: string;
  reason: string;
  preferred_language: string;
  status: string;
  created_at: string;
  triage_category: string | null;
  summary: string | null;
}

type RowState = "saved_on_device" | "waiting" | "syncing" | "sent" | "attention";

/** Rendered directly by the default page and by regression tests. */
export function CareRequestHistory({ onBack }: { onBack: () => void }) {
  const { t, language } = useLanguage();
  const sync = useSync();
  const [serverRows, setServerRows] = useState<ServerCareRequest[] | null>(null);
  const [loadFailedOffline, setLoadFailedOffline] = useState(false);

  const tt = (key: Parameters<typeof t2>[1], vars?: Record<string, string | number>) =>
    t2(language, key, vars);

  const queuedRows = useMemo(() => {
    return sync.items
      .filter((i) => i.actionType === "care_request.create")
      .map((i) => {
        const p = i.payload as { kind: "care_request.create"; reason: string; clientCreatedAt: string };
        let state: RowState;
        if (i.state === "synced") state = "sent";
        else if (i.state === "failed" || i.state === "requires_attention") state = "attention";
        else if (i.state === "syncing") state = "syncing";
        else state = sync.online ? "syncing" : "waiting";
        return {
          key: i.id,
          text: p.reason,
          createdAt: p.clientCreatedAt ?? i.localCreatedAt,
          state,
          triage: (i.payload as { packet?: { triage_category?: string } }).packet?.triage_category ?? null,
        };
      });
  }, [sync.items, sync.online]);

  // Server rows load only when online; failure stays honest.
  useMemo(() => {
    if (!sync.online || serverRows || loadFailedOffline) return;
    let alive = true;
    fetch("/api/care-requests")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { careRequests?: ServerCareRequest[] } | null) => {
        if (alive) setServerRows(data?.careRequests ?? []);
      })
      .catch(() => {
        if (alive) setLoadFailedOffline(true);
      });
  }, [sync.online, serverRows, loadFailedOffline]);

  return (
    <section aria-labelledby="hist-h">
      <div className="flex items-center justify-between gap-3">
        <h1 id="hist-h" className="text-2xl font-semibold text-text-primary">
          {tt("historyHeading")}
        </h1>
        <Button variant="ghost" onClick={onBack}>
          {tt("back")}
        </Button>
      </div>

      {queuedRows.length === 0 && serverRows === null && !loadFailedOffline && (
        <p className="mt-6 text-sm text-text-secondary">…</p>
      )}

      {queuedRows.length === 0 && loadFailedOffline && (
        <p role="status" className="mt-6 rounded-2xl bg-[#FBF3E8] p-4 text-sm text-[#7A5A2E]">
          {t("offline")}
        </p>
      )}

      {queuedRows.length === 0 && serverRows !== null && serverRows.length === 0 && (
        <div className="mt-6">
          <p className="text-text-primary">{t("noCareRequestsYet")}</p>
          <p className="mt-1 text-sm text-text-secondary">{t("noCareRequestsYetHint")}</p>
        </div>
      )}

      {/* End-to-end journey timeline (Part 5) — real state only. Shown when
          this patient has at least one care request in flight or delivered. */}
      {(queuedRows.length > 0 || (serverRows ?? []).length > 0) && (() => {
        const latestQueued = queuedRows[0];
        const latestServer = (serverRows ?? [])[0];
        const journey = deriveJourney({
          queueItems: sync.items,
          online: sync.online,
          careRequest: latestServer
            ? {
                id: latestServer.id,
                status: latestServer.status,
                createdAt: latestServer.created_at,
                urgency: latestServer.triage_category,
              }
            : latestQueued
              ? {
                  id: latestQueued.key,
                  status: latestQueued.state === "sent" ? "submitted" : "draft",
                  createdAt: latestQueued.createdAt,
                  urgency: latestQueued.triage,
                }
              : null,
          // Appointment/consent/pharmacy inputs come from server state; the
          // history view has none loaded, so they stay absent (real absence,
          // not a fabricated step).
        });
        return <JourneyStatus steps={journey} />;
      })()}

      <ul className="mt-6 space-y-3">
        {queuedRows.map((row) => (
          <li key={row.key}>
            <Card padding="sm">
              <p className="text-text-primary">{row.text || "…"}</p>
              <p className="mt-1 text-xs text-text-secondary">
                {new Date(row.createdAt).toLocaleString()}
              </p>
              <StateBadge state={row.state} label={stateLabel(row.state, tt)} />
              {(row.state === "attention" || row.state === "waiting") && (
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" onClick={() => void sync.retryItem(row.key)}>
                    {tt("histRetry")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm(tt("histRemoveConfirm"))) {
                        void sync.removeItem(row.key);
                      }
                    }}
                  >
                    {tt("histRemove")}
                  </Button>
                </div>
              )}
            </Card>
          </li>
        ))}
        {(serverRows ?? []).map((r) => (
          <li key={r.id}>
            <Card padding="sm">
              <p className="text-text-primary">{r.summary || r.reason}</p>
              <p className="mt-1 text-xs text-text-secondary">
                {new Date(r.created_at).toLocaleString()}
              </p>
              <StateBadge state="sent" label={tt("histSent")} />
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StateBadge({ state, label }: { state: RowState; label: string }) {
  const cls =
    state === "sent"
      ? "bg-[#EAF2ED] text-[#1E4D45]"
      : state === "attention"
        ? "bg-[#F7E9E4] text-[#8A4B32]"
        : state === "syncing"
          ? "bg-[#FBF3E8] text-[#7A5A2E]"
          : "bg-canvas text-text-secondary";
  return (
    <p className="mt-2">
      <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
        {label}
      </span>
    </p>
  );
}

function stateLabel(
  state: RowState,
  tt: (key: Parameters<typeof t2>[1]) => string
): string {
  switch (state) {
    case "sent": return tt("histSent");
    case "attention": return tt("histNeedsAttention");
    case "syncing": return tt("histSyncing");
    case "waiting": return tt("histWaitingForConnection");
    case "saved_on_device": return tt("histSavedOnDevice");
  }
}
