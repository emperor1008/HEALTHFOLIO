"use client";

/**
 * SyncStatus — compact connection/queue state card for the Home screen.
 * Shows one of five truthful states, with a details disclosure listing
 * failed items and a manual Sync now action.
 */

import { useId, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { useSync } from "@/lib/offline/sync-provider";
import type { QueueItem } from "@/lib/offline/types";

function formatItemLabel(item: QueueItem, t: ReturnType<typeof useLanguage>["t"]): string {
  switch (item.actionType) {
    case "care_request.create":
      return t("careRequestTitle");
    case "record.stage_upload":
      return `${t("fileLabel")}: ${item.payload.kind === "record.stage_upload" ? item.payload.fileName : ""}`;
    case "profile.update_language":
      return t("languageLabel");
    case "profile.update_contact":
      return t("contactMethodLabel");
    default:
      return t("fileLabel");
  }
}

export function SyncStatus() {
  const { t } = useLanguage();
  const sync = useSync();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const detailsId = useId();
  const announcementId = useId();

  const { online, syncing, pendingCount, failedCount, items } = sync;

  // Region: derive display state. When everything is healthy and
  // synchronized we render NOTHING — a polished app stays quiet unless
  // there is something the user needs to know.
  const state = failedCount > 0
    ? "needs_attention"
    : syncing
      ? "syncing"
      : online
        ? pendingCount > 0
          ? "syncing" // online with pending items: they're being delivered now
          : "all_synced"
        : pendingCount > 0
          ? "offline_pending"
          : "all_synced";

  if (state === "all_synced") return null;

  const waitingText =
    pendingCount === 1
      ? t("oneItemWaiting")
      : t("itemsWaiting", { count: pendingCount });
  const failedText =
    failedCount === 1 ? t("oneItemFailed") : t("itemsFailed", { count: failedCount });

  const cardStyles: Record<Exclude<typeof state, "all_synced">, string> = {
    offline_pending: "bg-[#FBF3E8] text-[#7A5A2E] border-[#7A5A2E]/20",
    syncing: "bg-[#EAF2ED] text-[#1E4D45] border-[#1E4D45]/15",
    needs_attention: "bg-[#F7E9E4] text-[#8A4B32] border-[#8A4B32]/20",
  };
  const dotStyles: Record<Exclude<typeof state, "all_synced">, string> = {
    offline_pending: "bg-[#C99A3F]",
    syncing: "bg-[#2E7D5B] animate-pulse",
    needs_attention: "bg-[#B45A38]",
  };

  const titleText = {
    offline_pending: t("syncStateOfflinePending"),
    syncing: t("syncStateSyncing"),
    needs_attention: t("syncStateNeedsAttention"),
  }[state];

  const hintText = {
    offline_pending: t("syncStateOfflinePendingHint"),
    syncing: t("syncStateSyncingHint"),
    needs_attention: t("syncStateNeedsAttentionHint"),
  }[state];

  return (
    <section
      aria-labelledby={detailsId}
      className={`rounded-2xl border p-4 transition-colors ${cardStyles[state]}`}
      data-state={state}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotStyles[state]}`}
        />
        <div className="min-w-0 flex-1">
          <h2 id={detailsId} className="text-sm font-semibold leading-5">
            {titleText}
          </h2>
          <p className="mt-0.5 text-sm opacity-80">{hintText}</p>
        </div>
        {(state === "needs_attention" || (syncing && pendingCount > 0)) && (
          <button
            type="button"
            onClick={() => void sync.syncNow()}
            disabled={syncing}
            className="min-h-[44px] shrink-0 rounded-full border border-current/30 bg-white/60 px-4 text-sm font-medium transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            {syncing ? t("syncingNow") : t("syncNow")}
          </button>
        )}
      </div>

      {(failedCount > 0 || pendingCount > 0) && (
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen((open) => !open)}
          className="mt-3 flex min-h-[44px] w-full items-center justify-between rounded-xl bg-white/50 px-3 text-left text-sm font-medium transition hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          <span>{failedCount > 0 ? failedText : waitingText}</span>
          <span aria-hidden="true" className={`transition-transform ${detailsOpen ? "rotate-180" : ""}`}>
            ▾
          </span>
        </button>
      )}

      {detailsOpen && (
        <ul id={detailsId} className="mt-2 space-y-2" role="list">
          {items
            .filter((item) => item.state !== "synced")
            .slice(0, 20)
            .map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-white/70 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {formatItemLabel(item, t)}
                </span>
                {item.lastFailureReason && (
                  <span className="w-full text-xs opacity-75">{item.lastFailureReason}</span>
                )}
                {item.state !== "syncing" && (
                  <button
                    type="button"
                    onClick={() => void sync.retryItem(item.id)}
                    className="min-h-[44px] rounded-full border border-current/25 px-3 text-sm font-medium transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                  >
                    {t("retryItem")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(item.id)}
                  className="min-h-[44px] rounded-full border border-current/25 px-3 text-sm font-medium transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                >
                  {t("removeDraft")}
                </button>
              </li>
            ))}
        </ul>
      )}

      {confirmingRemove && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-label={t("removeDraftConfirmTitle")}
          className="mt-2 rounded-xl border border-[#8A4B32]/25 bg-white p-3"
        >
          <p className="text-sm font-medium text-[#1E4D45]">{t("removeDraftConfirmTitle")}</p>
          <p className="mt-1 text-sm text-[#3F4A46]">{t("removeDraftConfirmBody")}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={async () => {
                await sync.removeItem(confirmingRemove);
                setConfirmingRemove(null);
              }}
              className="min-h-[44px] rounded-full bg-[#8A4B32] px-4 text-sm font-medium text-white transition hover:bg-[#6F3B27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8A4B32]"
            >
              {t("removeDraftConfirmYes")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRemove(null)}
              className="min-h-[44px] rounded-full border border-[#1E4D45]/25 px-4 text-sm font-medium text-[#1E4D45] transition hover:bg-[#1E4D45]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            >
              {t("removeDraftConfirmNo")}
            </button>
          </div>
        </div>
      )}

      {/* Screen-reader announcements for sync-state changes */}
      <p id={announcementId} role="status" aria-live="polite" className="sr-only">
        {state === "syncing"
          ? t("syncStartedAnnouncement")
          : state === "needs_attention"
            ? t("syncFailedAnnouncement")
            : ""}
      </p>
    </section>
  );
}
