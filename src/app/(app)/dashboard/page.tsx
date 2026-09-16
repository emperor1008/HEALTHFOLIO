"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { createClient } from "@/lib/supabase/browser";
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

const STATUS_LABELS: Record<string, { label: string; variant: "verified" | "review" | "processing" | "failed" | "default" }> = {
  completed: { label: "Processed", variant: "verified" },
  review_required: { label: "Review needed", variant: "review" },
  failed: { label: "Needs attention", variant: "failed" },
  uploaded: { label: "Uploaded", variant: "processing" },
  extracting: { label: "Reading document", variant: "processing" },
  classifying: { label: "Identifying type", variant: "processing" },
  organizing: { label: "Organizing", variant: "processing" },
};

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
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

  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [creating, setCreating] = useState(false);
  const [creatingAndUploading, setCreatingAndUploading] = useState(false);

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
          title="We couldn't load your health space right now"
          description="This is usually a connection issue. Your records are safe — try again in a moment."
          action={{
            label: "Try again",
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
                Welcome to your health space
              </h1>
              <p className="mx-auto mt-3 max-w-md text-text-secondary">
                Build your health timeline by adding your first medical record.
                Healthfolio organizes reports, prescriptions and scans into one
                private, verified space.
              </p>
            </div>

            <div className="mt-8 rounded-card border border-sage-border bg-sage-surface p-6 text-center">
              <p className="text-sm font-medium text-text-primary">
                You can add:
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {["Lab reports", "Prescriptions", "Scan images", "Discharge summaries"].map((label) => (
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
                  loadingText="Preparing…"
                  disabled={creating}
                  onClick={() => createPortfolio(true)}
                >
                  Scan or upload a record
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  loading={creating && !creatingAndUploading}
                  loadingText="Creating…"
                  disabled={creating}
                  onClick={() => createPortfolio(false)}
                >
                  Just create my space
                </Button>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-text-secondary/80">
              Your documents remain private to your account and are processed
              only for your Healthfolio.
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
      title: `${docsNeedingReview.length} document${docsNeedingReview.length !== 1 ? "s" : ""} with uncertain details`,
      description: "A quick look keeps your timeline accurate.",
    });
  }
  if (overview.pendingMeasurements > 0) {
    attentionItems.push({
      href: "/health-tracking",
      title: `${overview.pendingMeasurements} measurement${overview.pendingMeasurements !== 1 ? "s" : ""} awaiting your confirmation`,
      description: "Confirmed values make your trends reliable.",
    });
  }
  if (
    overview.runs.some((r) => r.status === "waiting_for_user" || r.status === "blocked")
  ) {
    attentionItems.push({
      href: "/review",
      title: "Processing is paused for your input",
      description: "Resolve the open items to continue organizing.",
    });
  }

  const latestVerifiedDoc = overview.documents.find(
    (d) => d.processing_status === "completed" && !d.requires_review
  );
  const recentDocs = overview.documents.slice(0, 4);

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Welcome */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
              Welcome to your health space
            </h1>
            <p className="mt-2 max-w-lg text-text-secondary">
              {overview.documents.length === 0
                ? "Build your health timeline by adding your first medical record."
                : `${overview.documents.length} record${overview.documents.length !== 1 ? "s" : ""} organized so far. Here's where things stand.`}
            </p>
          </div>
        </div>

        {/* Primary capture CTA */}
        <Card
          padding="lg"
          className="border-sage-border bg-sage-surface"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Scan or upload a record
              </h2>
              <p className="mt-1 max-w-md text-sm text-text-secondary">
                Take a photo of a report or upload a file — Healthfolio reads
                it, organizes it, and shows you what to confirm.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <AddRecordButton portfolioId={portfolio.id} label="Take a photo" sourceOverride="camera" />
              <AddRecordButton portfolioId={portfolio.id} label="Upload file" sourceOverride="file" />
            </div>
          </div>
        </Card>

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
                Needs your attention
              </h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {attentionItems.map((item) => (
                <Link key={item.href + item.title} href={item.href}>
                  <Card padding="md" className="border-terracotta-border/60 transition-colors hover:border-terracotta/40">
                    <p className="font-medium text-text-primary">{item.title}</p>
                    <p className="mt-1 text-sm text-text-secondary">{item.description}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-terracotta">
                      Review
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
            Latest verified insight
          </h2>
          {overview.trends.length === 0 ? (
            <Card padding="lg" className="mt-4">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-text-primary">
                    No verified health insights yet
                  </p>
                  <p className="mt-1 max-w-md text-sm text-text-secondary">
                    Once you confirm the details Healthfolio reads from your
                    reports, your trends and timeline appear here.
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
                      {formatShortDate(trend.latestDate)} · {trend.graphableMeasurements} points
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
              Recent Healthfolio activity
            </h2>
            <Link href="/records" className="text-sm font-medium text-primary hover:underline">
              View all records
            </Link>
          </div>

          {overview.documents.length === 0 && overview.runs.length === 0 ? (
            <Card padding="lg" className="mt-4">
              <p className="text-sm text-text-secondary">
                Your organized records will appear here after your first upload
                is processed.
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
                              {formatShortDate(doc.created_at)}
                              {doc.category ? ` · ${doc.category.replace(/_/g, " ")}` : ""}
                            </p>
                          </div>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </div>
                      </Card>
                    </Link>
                  );
                })}
                {overview.documents.length === 0 && (
                  <Card padding="md">
                    <p className="text-sm text-text-secondary">No documents yet.</p>
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
                            {formatShortDate(run.created_at)}
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
                            ? "Complete"
                            : run.status === "failed"
                            ? "Needs attention"
                            : run.status === "waiting_for_user"
                            ? "Waiting for you"
                            : run.status === "blocked"
                            ? "Waiting for you"
                            : "Processing"}
                        </Badge>
                      </div>
                    </Card>
                  </Link>
                ))}
                {overview.runs.length === 0 && (
                  <Card padding="md">
                    <p className="text-sm text-text-secondary">
                      Processing activity will appear after your first upload.
                    </p>
                  </Card>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </PageTransition>
  );
}
