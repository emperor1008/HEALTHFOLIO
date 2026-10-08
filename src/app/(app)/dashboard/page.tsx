"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  useHealthSpace,
  fetchHealthOverview,
  type Portfolio,
} from "@/lib/hooks/use-health-space";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  SkeletonDashboard,
  SkeletonLine,
} from "@/components/ui/Skeletons";import { PageTransition } from "@/components/ui/PageTransition";
import { AddRecordButton } from "@/components/capture/AddRecordButton";
import { HealthSignalsSection } from "@/components/signals/HealthSignalsSection";
import { SyncStatus } from "@/components/offline/SyncStatus";
import { FirstUseLanguageChooser } from "@/components/offline/FirstUseLanguageChooser";
import { useLanguage } from "@/lib/i18n/language-context";
import type { Dict, Language } from "@/lib/i18n";
import { VoiceListen } from "@/components/voice/VoiceListen";
import { VoiceAssistant } from "@/components/voice/VoiceAssistant";

interface Overview {
  documents: Array<{
    id: string;
    original_name: string;
    title: string | null;
    category: string | null;
    processing_status: string;
    requires_review: boolean;
    created_at: string;
  }>;
  runs: Array<{ id: string; goal: string; status: string; created_at: string }>;
  trends: Array<{
    normalizedTestName: string;
    normalizedUnit: string | null;
    latestValue: number;
    latestDate: string;
    changeDirection: string;
    graphableMeasurements: number;
  }>;
  pendingMeasurements: number;
}

type PageState =
  | { kind: "loading" }
  | { kind: "bootstrap" }
  | { kind: "failure"; retry: () => void }
  | { kind: "onboarding"; portfolio: Portfolio | null }
  | { kind: "ready"; portfolio: Portfolio; overview: Overview };

const STATUS_LABELS: Record<string, { key: keyof Dict; variant: "verified" | "review" | "processing" | "failed" | "default" }> = {
  completed: { key: "dashboardStatusProcessed", variant: "verified" },
  review_required: { key: "dashboardStatusReview", variant: "review" },
  failed: { key: "dashboardRunNeedsAttention", variant: "failed" },
  uploaded: { key: "dashboardStatusUploaded", variant: "processing" },
  extracting: { key: "dashboardStatusExtracting", variant: "processing" },
  classifying: { key: "dashboardStatusClassifying", variant: "processing" },
  organizing: { key: "dashboardStatusOrganizing", variant: "processing" },
};

/** Date formatting follows the patient's language, not a fixed locale. */
const DATE_LOCALES: Record<Language, string> = {
  en: "en-IN",
  hi: "hi-IN",
  or: "or-IN",
};

function formatShortDate(dateStr: string | null, language: Language): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString(DATE_LOCALES[language], {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const healthSpace = useHealthSpace();
  const { t, language } = useLanguage();

  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [creating, setCreating] = useState(false);
  const [creatingAndUploading, setCreatingAndUploading] = useState(false);
  const [evidenceFor, setEvidenceFor] = useState<{ documentId: string; pageNumber: number } | null>(null);
  const evidenceDialogRef = useRef<HTMLDivElement>(null);

  // Evidence dialog: Escape closes, focus moves in on open.
  useEffect(() => {
    if (!evidenceFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEvidenceFor(null);
    };
    document.addEventListener("keydown", onKey);
    evidenceDialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [evidenceFor]);

  const loadOverview = useCallback(async (portfolio: Portfolio) => {
    const overview = await fetchHealthOverview(portfolio.id);
    if (!overview) {
      setPageState({
        kind: "failure",
        retry: () => setPageState({ kind: "loading" }),
      });
      return;
    }
    setPageState({ kind: "ready", portfolio, overview });
  }, []);

  // When the health space resolves, load the overview data
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (healthSpace.status === "loading") {
        if (!cancelled) setPageState((prev) =>
          prev.kind === "ready" ? prev : { kind: "loading" }
        );
        return;
      }

      if (healthSpace.status === "needs_consent") {
        if (!cancelled) setPageState({ kind: "bootstrap" });
        router.replace("/consent");
        return;
      }

      if (healthSpace.status === "no_portfolio") {
        if (!cancelled) setPageState({ kind: "onboarding", portfolio: null });
        return;
      }

      if (healthSpace.status === "failure") {
        if (!cancelled)
          setPageState({ kind: "failure", retry: healthSpace.retry });
        return;
      }

      if (healthSpace.status === "ready") {
        if (cancelled) return;
        await loadOverview(healthSpace.portfolio);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [healthSpace, loadOverview, router]);

  async function createPortfolio(andUpload: boolean) {
    setCreating(true);
    if (andUpload) setCreatingAndUploading(true);

    try {
      const res = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const json = await res.json();

      if (json.error) {
        setPageState({
          kind: "failure",
          retry: () => setPageState({ kind: "onboarding", portfolio: null }),
        });
        return;
      }

      const portfolio: Portfolio = json.data.portfolio;
      if (andUpload) {
        router.push("/records");
      } else {
        await loadOverview(portfolio);
      }
    } catch {
      setPageState({
        kind: "failure",
        retry: () => setPageState({ kind: "onboarding", portfolio: null }),
      });
    } finally {
      setCreating(false);
      setCreatingAndUploading(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────
  if (pageState.kind === "loading") {
    return <SkeletonDashboard />;
  }

  // ── Failure (calm, no technical details) ────────────────────────────
  if (pageState.kind === "failure") {
    return (
      <PageTransition>
        <EmptyState
          icon="🌤"
          title={t("dashboardLoadFailTitle")}
          description={t("dashboardLoadFailHint")}
          action={{
            label: t("tryAgain"),
            onClick: () => {
              setPageState({ kind: "loading" });
              healthSpace.status === "failure" ? healthSpace.retry() : window.location.reload();
            },
          }}
        />
      </PageTransition>
    );
  }

  // ── First-time onboarding ───────────────────────────────────────────
  if (pageState.kind === "onboarding") {
    return (
      <PageTransition>
        <div className="mx-auto max-w-lg py-6 md:py-12">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 21s-7.5-4.6-9.7-9A5.6 5.6 0 0112 6.4 5.6 5.6 0 0121.7 12c-2.2 4.4-9.7 9-9.7 9z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-primary"
                  />
                </svg>
              </div>

              <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
                {t("onboardingTitle")}
              </h1>
              <p className="mx-auto mt-3 max-w-md text-text-secondary">
                {t("onboardingIntro")}
              </p>
            </div>

            <div className="mt-8 rounded-card border border-sage-border bg-sage-surface p-6 text-center">
              <p className="text-sm font-medium text-text-primary">
                {t("onboardingCanAdd")}
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {[t("onboardingLab"), t("onboardingRx"), t("onboardingScans"), t("onboardingDischarge")].map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded-full border border-sage-border bg-surface px-3 py-1.5 text-xs text-text-secondary"
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  size="lg"
                  loading={creatingAndUploading}
                  loadingText={t("onboardingPreparing")}
                  disabled={creating}
                  onClick={() => createPortfolio(true)}
                >
                  {t("onboardingUpload")}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  loading={creating && !creatingAndUploading}
                  loadingText={t("onboardingCreating")}
                  disabled={creating}
                  onClick={() => createPortfolio(false)}
                >
                  {t("onboardingCreate")}
                </Button>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-text-secondary/80">
              {t("onboardingPrivacy")}
            </p>
          </motion.div>
        </div>
      </PageTransition>
    );
  }

  // Transient state while redirecting to consent — render nothing extra
  if (pageState.kind === "bootstrap") {
    return <SkeletonDashboard />;
  }

  const { portfolio, overview } = pageState;

  // ── Attention items ─────────────────────────────────────────────────
  const docsNeedingReview = overview.documents.filter(
    (d) => d.requires_review || d.processing_status === "review_required"
  );
  const attentionItems: Array<{
    href: string;
    title: string;
    description: string;
  }> = [];

  if (docsNeedingReview.length > 0) {
    attentionItems.push({
      href: "/review",
      title:
        docsNeedingReview.length === 1
          ? t("dashboardAttentionDocsOne")
          : t("dashboardAttentionDocsMany", {
              count: docsNeedingReview.length,
            }),
      description: t("dashboardAttentionDocsHint"),
    });
  }
  if (overview.pendingMeasurements > 0) {
    attentionItems.push({
      href: "/health-tracking",
      title:
        overview.pendingMeasurements === 1
          ? t("dashboardAttentionMeasurementsOne")
          : t("dashboardAttentionMeasurementsMany", {
              count: overview.pendingMeasurements,
            }),
      description: t("dashboardAttentionMeasurementsHint"),
    });
  }
  if (
    overview.runs.some((r) => r.status === "waiting_for_user" || r.status === "blocked")
  ) {
    attentionItems.push({
      href: "/review",
      title: t("dashboardAttentionPaused"),
      description: t("dashboardAttentionPausedHint"),
    });
  }

  const latestVerifiedDoc = overview.documents.find(
    (d) => d.processing_status === "completed" && !d.requires_review
  );
  const recentDocs = overview.documents.slice(0, 4);

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Connection + queue status */}
        <SyncStatus />

        {/* First-use language choice (shown once per device) */}
        <FirstUseLanguageChooser />

        {/* Welcome */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
              {t("welcome")}
            </h1>
            <div className="mt-2 flex max-w-lg items-start gap-2 text-text-secondary">
              <p>
                {overview.documents.length === 0
                  ? t("dashboardEmptyHint")
                  : overview.documents.length === 1
                    ? t("dashboardRecordsOne")
                    : t("dashboardRecordsMany", {
                        count: overview.documents.length,
                      })}
              </p>
              <VoiceListen
                text={
                  `${t("welcome")}. ${
                    overview.documents.length === 0
                      ? t("dashboardEmptyHint")
                      : overview.documents.length === 1
                        ? t("dashboardRecordsOne")
                        : t("dashboardRecordsMany", {
                            count: overview.documents.length,
                          })
                  }`
                }
                language={language}
              />
            </div>
          </div>
        </div>

        {/* Primary care actions — rural-first hierarchy:
            Talk to a Doctor → Check My Symptoms → Check Medicine → My Health.
            Icon + short label + plain-language hint; upload stays secondary. */}
        <section aria-label={t("homeChooseAction")}>
          <h2 className="sr-only">{t("homeChooseAction")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/care-requests"
              className="flex min-h-[72px] items-center gap-4 rounded-2xl border border-sage-border bg-sage-surface px-5 py-4 transition-colors hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M21 12a8 8 0 01-8 8H4l2.3-2.9A8 8 0 1121 12z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 10.2v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold text-text-primary">
                  {t("homeTalkToDoctor")}
                </span>
                <span className="mt-0.5 block text-sm text-text-secondary">
                  {t("homeTalkToDoctorHint")}
                </span>
              </span>
              <span aria-hidden="true" className="ml-auto text-primary">→</span>
            </Link>
            <Link
              href="/symptoms"
              className="flex min-h-[72px] items-center gap-4 rounded-2xl border border-sage-border bg-sage-surface px-5 py-4 transition-colors hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 20s-6.5-4-6.5-9A3.6 3.6 0 0112 7.6 3.6 3.6 0 0118.5 11c0 5-6.5 9-6.5 9z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M6.5 12h3l1.5-3 2 5 1.5-2h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold text-text-primary">
                  {t("homeCheckSymptoms")}
                </span>
                <span className="mt-0.5 block text-sm text-text-secondary">
                  {t("homeCheckSymptomsHint")}
                </span>
              </span>
              <span aria-hidden="true" className="ml-auto text-primary">→</span>
            </Link>
            <Link
              href="/medicines/pharmacy"
              className="flex min-h-[72px] items-center gap-4 rounded-2xl border border-sage-border bg-sage-surface px-5 py-4 transition-colors hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M10.2 21a4.3 4.3 0 01-6.1-6.1l8.8-8.8a4.3 4.3 0 016.1 6.1l-8.8 8.8z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M8.5 9.5l6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold text-text-primary">
                  {t("homeCheckMedicine")}
                </span>
                <span className="mt-0.5 block text-sm text-text-secondary">
                  {t("homeCheckMedicineHint")}
                </span>
              </span>
              <span aria-hidden="true" className="ml-auto text-primary">→</span>
            </Link>
            <Link
              href="/health-card"
              className="flex min-h-[72px] items-center gap-4 rounded-2xl border border-sage-border bg-sage-surface px-5 py-4 transition-colors hover:border-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M7 14h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold text-text-primary">
                  {t("homeMyHealth")}
                </span>
                <span className="mt-0.5 block text-sm text-text-secondary">
                  {t("homeMyHealthHint")}
                </span>
              </span>
              <span aria-hidden="true" className="ml-auto text-primary">→</span>
            </Link>
          </div>
        </section>

        {/* Voice assistant — speaks, understands, and drives the
            app above through the same routes a tap would use. */}
        <VoiceAssistant />

        {/* Document capture — secondary action, never the primary CTA */}
        <Card padding="lg" className="border-sage-border bg-sage-surface">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {t("dashboardUploadTitle")}
              </h2>
              <p className="mt-1 max-w-md text-sm text-text-secondary">
                {t("dashboardUploadHint")}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <AddRecordButton portfolioId={portfolio.id} label={t("takePhoto")} sourceOverride="camera" />
              <AddRecordButton portfolioId={portfolio.id} label={t("uploadFile")} sourceOverride="file" />
            </div>
          </div>
        </Card>

        {/* Health Signals (compact, max 3 open) */}
        <HealthSignalsSection
          limit={3}
          onOpenEvidence={(documentId, pageNumber) => setEvidenceFor({ documentId, pageNumber })}
        />

        {/* Needs your attention */}
        {attentionItems.length > 0 && (
          <section aria-labelledby="attention-heading">
            <div className="flex items-center justify-between">
              <h2
                id="attention-heading"
                className="flex items-center gap-2 text-lg font-semibold text-text-primary"
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-terracotta-soft text-terracotta"
                  aria-hidden="true"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 2.5v3.5M6 8.6v.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                {t("dashboardNeedsAttention")}
              </h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {attentionItems.map((item) => (
                <Link key={item.href + item.title} href={item.href}>
                  <Card padding="md" className="border-terracotta-border/60 transition-colors hover:border-terracotta/40">
                    <p className="font-medium text-text-primary">{item.title}</p>
                    <p className="mt-1 text-sm text-text-secondary">{item.description}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-terracotta">
                      {t("dashboardReview")}
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Latest verified insight / empty state */}
        <section aria-labelledby="insight-heading">
          <h2 id="insight-heading" className="text-lg font-semibold text-text-primary">
            {t("dashboardLatestInsight")}
          </h2>
          {overview.trends.length === 0 ? (
            <Card padding="lg" className="mt-4">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-text-primary">
                    {t("dashboardNoInsightsTitle")}
                  </p>
                  <p className="mt-1 max-w-md text-sm text-text-secondary">
                    {t("dashboardNoInsightsHint")}
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {overview.trends.map((trend) => (
                <Link
                  key={trend.normalizedTestName}
                  href={`/health-tracking/tests/${encodeURIComponent(trend.normalizedTestName)}`}
                >
                  <Card padding="md" className="transition-colors hover:border-primary/30">
                    <p className="text-xs font-medium capitalize text-text-secondary">
                      {trend.normalizedTestName.replace(/_/g, " ")}
                    </p>
                    <p className="mt-1.5 text-2xl font-semibold text-text-primary">
                      {trend.latestValue}
                      {trend.normalizedUnit ? ` ${trend.normalizedUnit}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {formatShortDate(trend.latestDate, language)} ·{" "}
                      {trend.graphableMeasurements === 1
                        ? t("dashboardPointsOne")
                        : t("dashboardPointsMany", {
                            count: trend.graphableMeasurements,
                          })}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Recent activity */}
        <section aria-labelledby="recent-heading">
          <div className="flex items-center justify-between">
            <h2 id="recent-heading" className="text-lg font-semibold text-text-primary">
              {t("dashboardRecentActivity")}
            </h2>
            <Link href="/records" className="text-sm font-medium text-primary hover:underline">
              {t("dashboardViewAllRecords")}
            </Link>
          </div>

          {overview.documents.length === 0 && overview.runs.length === 0 ? (
            <Card padding="lg" className="mt-4">
              <p className="text-sm text-text-secondary">
                {t("dashboardRecentEmpty")}
              </p>
            </Card>
          ) : (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {/* Recent documents */}
              <div className="space-y-3">
                {recentDocs.map((doc) => {
                  const status = STATUS_LABELS[doc.processing_status] || STATUS_LABELS.completed;
                  return (
                    <Link key={doc.id} href="/records">
                      <Card padding="md" className="transition-colors hover:border-primary/30">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-text-primary">
                              {doc.title || doc.original_name}
                            </p>
                            <p className="mt-0.5 text-xs text-text-secondary">
                              {formatShortDate(doc.created_at, language)}
                              {doc.category ? ` · ${doc.category.replace(/_/g, " ")}` : ""}
                            </p>
                          </div>
                          <Badge variant={status.variant}>{t(status.key)}</Badge>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
                {overview.documents.length === 0 && (
                  <Card padding="md">
                    <p className="text-sm text-text-secondary">
                      {t("dashboardNoDocuments")}
                    </p>
                  </Card>
                )}
              </div>

              {/* Agent runs */}
              <div className="space-y-3">
                {overview.runs.map((run) => (
                  <Link key={run.id} href={`/runs/${run.id}`}>
                    <Card padding="md" className="transition-colors hover:border-primary/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-text-primary">
                            {run.goal}
                          </p>
                          <p className="mt-0.5 text-xs text-text-secondary">
                            {formatShortDate(run.created_at, language)}
                          </p>
                        </div>
                        <Badge
                          variant={
                            run.status === "complete"
                              ? "verified"
                              : run.status === "failed"
                              ? "failed"
                              : run.status === "waiting_for_user" || run.status === "blocked"
                              ? "review"
                              : "processing"
                          }
                        >
                          {run.status === "complete"
                            ? t("dashboardRunComplete")
                            : run.status === "failed"
                            ? t("dashboardRunNeedsAttention")
                            : run.status === "waiting_for_user"
                            ? t("dashboardRunWaiting")
                            : run.status === "blocked"
                            ? t("dashboardRunWaiting")
                            : t("dashboardRunProcessing")}
                        </Badge>
                      </div>
                    </Card>
                  </Link>
                ))}
                {overview.runs.length === 0 && (
                  <Card padding="md">
                    <p className="text-sm text-text-secondary">
                      {t("dashboardProcessingEmpty")}
                    </p>
                  </Card>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
      {evidenceFor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEvidenceFor(null);
          }}
        >
          <div
            ref={evidenceDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("dashboardEvidenceNote", {
              page: evidenceFor.pageNumber,
            })}
            tabIndex={-1}
            className="w-full max-w-2xl rounded-t-2xl bg-canvas p-4 shadow-xl outline-none sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-text-secondary">
                {t("dashboardEvidenceNote", {
                  page: evidenceFor.pageNumber,
                })}
              </p>
              <button
                type="button"
                onClick={() => setEvidenceFor(null)}
                aria-label={t("cancel")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-input text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </button>
            </div>
            <Link
              href="/records"
              className="mt-3 inline-flex h-11 items-center rounded-input bg-primary px-5 font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              onClick={() => setEvidenceFor(null)}
            >
              {t("dashboardOpenRecords")}
            </Link>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
