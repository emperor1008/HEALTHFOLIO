"use client";

/**
 * Care requests hub (Part 2).
 *
 * - Menu: start a guided care request (wizard) or view history.
 * - Wizard: guided intake + deterministic triage + packet review.
 * - History: truthful states only —
 *     Saved on this device / Waiting for connection / Syncing / Sent /
 *     Needs attention. No doctor, appointment, or pharmacy claims.
 *
 * Safety: no diagnosis wording; fixed emergency notice; local queue items
 * are never described as "sent" until the server acknowledges them.
 */

import { useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { t2 } from "@/lib/i18n/part2";
import { useSync } from "@/lib/offline/sync-provider";
import { PageTransition } from "@/components/ui/PageTransition";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CareRequestWizard } from "@/components/care/CareRequestWizard";
import { CareRequestHistory } from "@/components/care/CareRequestHistory";

type View = "menu" | "wizard" | "history";

export default function CareRequestsPage() {
  const { t, language } = useLanguage();
  const sync = useSync();
  const [view, setView] = useState<View>("menu");
  const [justSaved, setJustSaved] = useState(false);

  const tt = (key: Parameters<typeof t2>[1], vars?: Record<string, string | number>) =>
    t2(language, key, vars);

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
        {view === "menu" && (
          <section aria-labelledby="cr-title">
            <h1 id="cr-title" className="text-2xl font-semibold text-text-primary">
              {t("careRequestTitle")}
            </h1>
            <p className="mt-2 text-sm text-text-secondary">{t("careRequestIntro")}</p>

            <div className="mt-4 rounded-2xl border border-[#8A4B32]/25 bg-[#F7E9E4] p-4">
              <p className="text-sm font-medium text-[#8A4B32]">{t("notMedicalAdvice")}</p>
              <p className="mt-1 text-sm text-[#8A4B32]">{t("emergencyNotice")}</p>
            </div>

            {justSaved && (
              <p role="status" className="mt-4 rounded-2xl bg-[#EAF2ED] p-4 text-sm font-medium text-[#1E4D45]">
                {sync.online ? t("careRequestSavedOnline") : tt("wizardOfflineSaved")}
              </p>
            )}

            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={() => {
                  setJustSaved(false);
                  setView("wizard");
                }}
                className="flex min-h-[64px] items-center justify-between rounded-2xl border border-[#1E4D45]/25 bg-white p-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4D45] hover:bg-[#1E4D45]/5"
              >
                <span>
                  <span className="block text-base font-semibold text-text-primary">
                    {tt("careStartHeading")}
                  </span>
                  <span className="mt-1 block text-sm text-text-secondary">{tt("careStartIntro")}</span>
                </span>
                <span aria-hidden="true" className="text-2xl text-[#1E4D45]">→</span>
              </button>

              <button
                type="button"
                onClick={() => setView("history")}
                className="flex min-h-[64px] items-center justify-between rounded-2xl border border-[#1E4D45]/25 bg-white p-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4D45] hover:bg-[#1E4D45]/5"
              >
                <span>
                  <span className="block text-base font-semibold text-text-primary">
                    {tt("historyHeading")}
                  </span>
                  <span className="mt-1 block text-sm text-text-secondary">
                    {t("noCareRequestsYetHint")}
                  </span>
                </span>
                <span aria-hidden="true" className="text-2xl text-[#1E4D45]">→</span>
              </button>
            </div>
          </section>
        )}

        {view === "wizard" && (
          <div className="pt-2">
            <CareRequestWizard
              onClose={() => setView("menu")}
              onSaved={() => {
                setJustSaved(true);
                setView("menu");
              }}
            />
          </div>
        )}

        {view === "history" && (
          <CareRequestHistory onBack={() => setView("menu")} />
        )}
      </main>
    </PageTransition>
  );
}

// ─── History ────────────────────────────────────────────────────────────────

type RowState = "saved_on_device" | "waiting" | "syncing" | "sent" | "attention";

