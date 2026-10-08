"use client";

/**
 * Offline Health Card page (Phase 2).
 *
 * - Opens from the ENCRYPTED LOCAL SNAPSHOT first — no API wait on open,
 *   fully usable with no network (browser limitation: IndexedDB + Web Crypto
 *   are required; without them the card honestly shows "no saved copy").
 * - Refreshes in the background when a session + connection exist; failures
 *   keep the saved copy visible with an honest "could not update" note.
 * - Stale snapshots (>24h) are labeled, never blocked, never shown as fresh.
 * - Clear-local removes ciphertext + key material from THIS device only,
 *   behind an explicit confirmation.
 * - Facts editor PATCHes allergies/conditions through the API and refreshes
 *   the local snapshot; offline saves are refused honestly (nothing fake).
 */

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import type { Language } from "@/lib/i18n";
import { tPhase2, type Phase2Dict } from "@/lib/i18n/phase2";
import { PageTransition } from "@/components/ui/PageTransition";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useHealthCard, type HealthCardSyncState } from "@/lib/health-card/use-health-card";
import { HealthCardFactsSchema } from "@/lib/health-card/model";

const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  hi: "हिन्दी",
  or: "ଓଡ଼ିଆ",
};

const SYNC_LABEL_KEYS: Record<HealthCardSyncState, keyof Phase2Dict | null> = {
  none: null,
  synced: "hcSyncSynced",
  updating: "hcSyncUpdating",
  waiting_for_connection: "hcSyncWaiting",
  needs_attention: "hcSyncAttention",
};

/** Plain-language relative time for the "Last updated" line. */
function formatSaved(iso: string, tt: (key: keyof Phase2Dict, vars?: Record<string, string | number>) => string): string {
  const saved = Date.parse(iso);
  if (!Number.isFinite(saved)) return tt("timeUnknown");
  const diff = Date.now() - saved;
  if (diff < 60_000) return tt("timeJustNow");
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return minutes === 1 ? tt("timeMinuteAgo") : tt("timeMinutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? tt("timeHourAgo") : tt("timeHours", { count: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? tt("timeDayAgo") : tt("timeDays", { count: days });
}

type FactsMessage = "saved" | "offline" | "error" | null;

export default function HealthCardPage() {
  const { language, t } = useLanguage();
  const {
    card,
    savedAt,
    freshness,
    loadedLocal,
    online,
    syncState,
    refreshError,
    refresh,
    saveFacts,
    clearLocal,
  } = useHealthCard();

  const [refreshing, setRefreshing] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftAllergies, setDraftAllergies] = useState<string[]>([]);
  const [draftConditions, setDraftConditions] = useState<string[]>([]);
  const [addAllergy, setAddAllergy] = useState("");
  const [addCondition, setAddCondition] = useState("");
  const [savingFacts, setSavingFacts] = useState(false);
  const [factsMessage, setFactsMessage] = useState<FactsMessage>(null);

  const tt = (key: keyof Phase2Dict, vars?: Record<string, string | number>) =>
    tPhase2(language, key, vars);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const openEditor = () => {
    setDraftAllergies(card ? [...card.allergies] : []);
    setDraftConditions(card ? [...card.conditions] : []);
    setAddAllergy("");
    setAddCondition("");
    setFactsMessage(null);
    setEditorOpen(true);
  };

  const addItem = (
    value: string,
    setter: (updater: (prev: string[]) => string[]) => void
  ) => {
    const item = value.trim().slice(0, 120);
    if (!item) return;
    setter((prev) =>
      prev.includes(item) || prev.length >= 50 ? prev : [...prev, item]
    );
  };

  const removeItem = (
    item: string,
    setter: (updater: (prev: string[]) => string[]) => void
  ) => setter((prev) => prev.filter((x) => x !== item));

  const handleSaveFacts = async () => {
    if (savingFacts) return;
    const parsed = HealthCardFactsSchema.safeParse({
      allergies: draftAllergies,
      conditions: draftConditions,
    });
    if (!parsed.success) {
      setFactsMessage("error");
      return;
    }
    if (!online) {
      setFactsMessage("offline");
      return;
    }
    setSavingFacts(true);
    try {
      const ok = await saveFacts(parsed.data);
      if (ok) {
        setFactsMessage("saved");
        setEditorOpen(false);
      } else {
        setFactsMessage("error");
      }
    } finally {
      setSavingFacts(false);
    }
  };

  const handleClear = async () => {
    await clearLocal();
    setClearOpen(false);
    setEditorOpen(false);
    setCleared(true);
  };

  const syncLabelKey = SYNC_LABEL_KEYS[syncState];

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-text-primary">{tt("hcTitle")}</h1>
          <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            {tt("hcAvailableOffline")}
          </span>
        </div>
        <p className="mt-2 text-sm text-text-secondary">{tt("hcIntro")}</p>

        {!online && (
          <p role="status" className="mt-4 rounded-2xl bg-warning/10 p-4 text-sm text-text-primary">
            {tt("hcOfflineBanner")}
          </p>
        )}

        {/* Status row */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          {syncLabelKey && (
            <span role="status" className="text-text-secondary">
              {tt(syncLabelKey)}
            </span>
          )}
          {card && savedAt && (
            <span className="text-text-secondary">
              {tt("hcLastUpdated", { time: formatSaved(savedAt, tt) })}
            </span>
          )}
          <span className="ml-auto" />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleRefresh()}
            loading={refreshing || syncState === "updating"}
            disabled={!loadedLocal}
          >
            {tt("hcRefresh")}
          </Button>
        </div>

        {refreshError && (
          <p role="status" className="mt-3 rounded-2xl bg-canvas p-3 text-sm text-text-secondary">
            {tt("hcRefreshError")}
          </p>
        )}
        {freshness === "stale" && card && (
          <p role="status" className="mt-3 rounded-2xl bg-warning/10 p-3 text-sm text-text-primary">
            {tt("hcStaleNote")}
          </p>
        )}
        {cleared && (
          <p role="status" className="mt-3 rounded-2xl bg-primary/5 p-3 text-sm text-text-primary">
            {tt("hcCleared")}
          </p>
        )}

        {!loadedLocal && (
          <p className="mt-6 text-text-secondary" aria-hidden="true">
            …
          </p>
        )}

        {loadedLocal && !card && (
          <Card padding="lg" className="mt-6">
            <h2 className="text-lg font-semibold text-text-primary">{tt("hcEmptyTitle")}</h2>
            <p className="mt-2 text-text-secondary">{tt("hcEmptyBody")}</p>
            <div className="mt-4">
              <Button
                type="button"
                onClick={() => void handleRefresh()}
                loading={refreshing}
                disabled={!online}
              >
                {tt("hcRefresh")}
              </Button>
            </div>
          </Card>
        )}

        {loadedLocal && card && (
          <>
            <div className="mt-6 space-y-4">
              <Card padding="md">
                <h2 className="text-base font-semibold text-text-primary">
                  {tt("hcSectionProfile")}
                </h2>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">{tt("hcProfileName")}</dt>
                    <dd className="text-right text-text-primary">
                      {card.profile.displayName ?? tt("hcNotRecorded")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-secondary">{tt("hcProfileLanguage")}</dt>
                    <dd className="text-right text-text-primary">
                      {LANGUAGE_NAMES[card.profile.preferredLanguage]}
                    </dd>
                  </div>
                </dl>
              </Card>

              <Card padding="md">
                <h2 className="text-base font-semibold text-text-primary">
                  {tt("hcSectionMedicines")}
                </h2>
                {card.medications.length === 0 ? (
                  <p className="mt-2 text-sm text-text-secondary">{tt("hcNoMedicines")}</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {card.medications.map((name) => (
                      <li key={name} className="text-sm text-text-primary">
                        {name}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card padding="md">
                <h2 className="text-base font-semibold text-text-primary">
                  {tt("hcSectionAllergies")}
                </h2>
                {card.allergies.length === 0 ? (
                  <p className="mt-2 text-sm text-text-secondary">{tt("hcNotRecorded")}</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {card.allergies.map((item) => (
                      <li
                        key={item}
                        className="rounded-full border border-border px-3 py-1 text-sm text-text-primary"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card padding="md">
                <h2 className="text-base font-semibold text-text-primary">
                  {tt("hcSectionConditions")}
                </h2>
                {card.conditions.length === 0 ? (
                  <p className="mt-2 text-sm text-text-secondary">{tt("hcNotRecorded")}</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {card.conditions.map((item) => (
                      <li
                        key={item}
                        className="rounded-full border border-border px-3 py-1 text-sm text-text-primary"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card padding="md">
                <h2 className="text-base font-semibold text-text-primary">
                  {tt("hcSectionRecentCare")}
                </h2>
                {card.recentCare.length === 0 ? (
                  <p className="mt-2 text-sm text-text-secondary">{tt("hcNoRecentCare")}</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {card.recentCare.map((item) => (
                      <li key={item.id} className="text-sm">
                        <span className="text-text-primary">
                          {item.date ? `${item.date} · ` : ""}
                          {item.label || item.status}
                        </span>
                        <span className="ml-2 text-text-secondary">{item.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card padding="md">
                <h2 className="text-base font-semibold text-text-primary">
                  {tt("hcSectionDocuments")}
                </h2>
                <p className="mt-2 text-sm text-text-secondary">{tt("hcDocumentsNotCached")}</p>
              </Card>
            </div>

            {/* Facts editor */}
            {editorOpen ? (
              <Card padding="lg" className="mt-4">
                <h2 className="text-base font-semibold text-text-primary">
                  {tt("hcEditFacts")}
                </h2>

                <fieldset className="mt-4">
                  <legend className="text-sm font-medium text-text-primary">
                    {tt("hcFactsAllergiesLabel")}
                  </legend>
                  <ul className="mt-2 space-y-2">
                    {draftAllergies.map((item) => (
                      <li key={item} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-text-primary">{item}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeItem(item, setDraftAllergies)}
                          aria-label={`${tt("hcRemoveItem")}: ${item}`}
                        >
                          ✕
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={addAllergy}
                      onChange={(e) => setAddAllergy(e.target.value)}
                      placeholder={tt("hcAddAllergyPlaceholder")}
                      maxLength={120}
                      className="min-h-[44px] flex-1 rounded-card border border-border bg-surface p-2 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        addItem(addAllergy, setDraftAllergies);
                        setAddAllergy("");
                      }}
                    >
                      {tt("hcAdd")}
                    </Button>
                  </div>
                </fieldset>

                <fieldset className="mt-5">
                  <legend className="text-sm font-medium text-text-primary">
                    {tt("hcFactsConditionsLabel")}
                  </legend>
                  <ul className="mt-2 space-y-2">
                    {draftConditions.map((item) => (
                      <li key={item} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-text-primary">{item}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeItem(item, setDraftConditions)}
                          aria-label={`${tt("hcRemoveItem")}: ${item}`}
                        >
                          ✕
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={addCondition}
                      onChange={(e) => setAddCondition(e.target.value)}
                      placeholder={tt("hcAddConditionPlaceholder")}
                      maxLength={120}
                      className="min-h-[44px] flex-1 rounded-card border border-border bg-surface p-2 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        addItem(addCondition, setDraftConditions);
                        setAddCondition("");
                      }}
                    >
                      {tt("hcAdd")}
                    </Button>
                  </div>
                </fieldset>

                {factsMessage && (
                  <p
                    role={factsMessage === "error" ? "alert" : "status"}
                    className={`mt-4 rounded-card p-3 text-sm ${
                      factsMessage === "error"
                        ? "bg-warning/10 text-text-primary"
                        : "bg-primary/5 text-text-primary"
                    }`}
                  >
                    {factsMessage === "saved"
                      ? tt("hcFactsSaved")
                      : factsMessage === "offline"
                        ? tt("hcFactsNeedsOnline")
                        : tt("hcFactsInvalid")}
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    onClick={() => void handleSaveFacts()}
                    loading={savingFacts}
                    disabled={savingFacts}
                  >
                    {tt("hcSaveFacts")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEditorOpen(false)}
                    disabled={savingFacts}
                  >
                    {t("cancel")}
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="mt-4 flex flex-wrap gap-3">
                <Button type="button" variant="secondary" onClick={openEditor}>
                  {tt("hcEditFacts")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setClearOpen(true)}>
                  {tt("hcClear")}
                </Button>
              </div>
            )}
          </>
        )}

        {/* Clear-local confirmation (device only) */}
        {clearOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="hc-clear-h"
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          >
            <div className="w-full max-w-md rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl">
              <h2 id="hc-clear-h" className="text-lg font-semibold text-text-primary">
                {tt("hcClearTitle")}
              </h2>
              <p className="mt-2 text-sm text-text-secondary">{tt("hcClearBody")}</p>
              <div className="mt-5 flex gap-2">
                <Button type="button" onClick={() => void handleClear()}>
                  {tt("hcClearConfirm")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setClearOpen(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </PageTransition>
  );
}
