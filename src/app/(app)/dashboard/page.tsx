"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { AddRecordButton } from "@/components/capture/AddRecordButton";

interface Portfolio {
  id: string;
  label: string;
  created_at?: string;
}

interface Run {
  id: string;
  goal: string;
  status: string;
  created_at: string;
}

interface Document {
  id: string;
  original_name: string;
  status: string;
}

interface Appointment {
  id: string;
  starts_at: string;
  specialty: string | null;
  clinician_name: string | null;
  location: string | null;
}

type PageState = "loading" | "onboarding" | "failure" | "dashboard";

const SUPPORTED_DOC_TYPES = [
  { icon: "🩺", label: "Medical reports" },
  { icon: "💊", label: "Prescriptions" },
  { icon: "📄", label: "Discharge summaries" },
  { icon: "🖼️", label: "Scan images" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [nextAppointment, setNextAppointment] = useState<Appointment | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingAndUploading, setCreatingAndUploading] = useState(false);

  const loadDashboardData = useCallback(async (portfolioId: string) => {
    const supabase = createClient();

    const [docsResult, runsResult, apptResult] = await Promise.all([
      supabase
        .from("documents")
        .select("id, original_name, status")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("agent_runs")
        .select("id, goal, status, created_at")
        .eq("portfolio_id", portfolioId)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("appointments")
        .select("id, starts_at, specialty, clinician_name, location")
        .eq("portfolio_id", portfolioId)
        .eq("status", "planned")
        .order("starts_at", { ascending: true })
        .limit(1),
    ]);

    setDocuments(docsResult.data || []);
    setRuns(runsResult.data || []);
    setNextAppointment(Array.isArray(apptResult.data) ? apptResult.data[0] ?? null : apptResult.data);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) {
        if (!cancelled) {
          setErrorCode("SESSION_REQUIRED");
          setPageState("failure");
        }
        return;
      }

      // Check if portfolio exists
      const { data: existingPortfolio, error: fetchErr } = await supabase
        .from("portfolios")
        .select("id, label, created_at")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (fetchErr) {
        console.error("Portfolio fetch error:", fetchErr.code || fetchErr.message);
        setErrorCode("NETWORK_ERROR");
        setPageState("failure");
        return;
      }

      if (existingPortfolio) {
        setPortfolio(existingPortfolio);
        await loadDashboardData(existingPortfolio.id);
        if (!cancelled) setPageState("dashboard");
        return;
      }

      // No portfolio — show onboarding
      if (!cancelled) setPageState("onboarding");
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [loadDashboardData]);

  const createPortfolio = useCallback(
    async (andUpload: boolean) => {
      setCreating(true);
      if (andUpload) setCreatingAndUploading(true);

      try {
        const res = await fetch("/api/portfolios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const json = await res.json();

        if (json.error) {
          setErrorCode(json.error.code || "PORTFOLIO_CREATE_FAILED");
          setPageState("failure");
          return;
        }

        const p = json.data.portfolio;
        setPortfolio(p);

        if (andUpload) {
          // Navigate to documents page for upload
          router.push("/documents");
        } else {
          await loadDashboardData(p.id);
          setPageState("dashboard");
        }
      } catch {
        setErrorCode("NETWORK_ERROR");
        setPageState("failure");
      } finally {
        setCreating(false);
        setCreatingAndUploading(false);
      }
    },
    [router, loadDashboardData]
  );

  // STATE A: Loading
  if (pageState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Spinner size="lg" />
        <p className="mt-4 text-text-secondary">Preparing your Healthfolio…</p>
      </div>
    );
  }

  // STATE B: Onboarding (no portfolio)
  if (pageState === "onboarding") {
    return (
      <div className="flex flex-col items-center justify-center py-12 md:py-20">
        <Card padding="lg" className="w-full max-w-lg text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <span className="text-3xl" aria-hidden="true">
              🏥
            </span>
          </div>

          <h1 className="text-2xl font-bold text-text-primary">
            Start your Healthfolio
          </h1>

          <p className="mt-3 text-text-secondary leading-relaxed">
            Create your private health record space and upload your first medical
            document. Healthfolio will help organize reports, prescriptions and
            other records in one place.
          </p>

          {/* Supported document types */}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {SUPPORTED_DOC_TYPES.map((docType) => (
              <span
                key={docType.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-canvas px-3 py-1.5 text-sm text-text-secondary"
              >
                <span aria-hidden="true">{docType.icon}</span>
                {docType.label}
              </span>
            ))}
          </div>

          {/* Actions */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              loading={creatingAndUploading}
              loadingText="Creating your Healthfolio…"
              disabled={creating}
              onClick={() => createPortfolio(true)}
            >
              Create Healthfolio &amp; add document
            </Button>
            <Button
              variant="secondary"
              size="lg"
              loading={creating && !creatingAndUploading}
              loadingText="Creating…"
              disabled={creating}
              onClick={() => createPortfolio(false)}
            >
              Create Healthfolio
            </Button>
          </div>

          {/* Trust note */}
          <p className="mt-6 text-xs text-text-secondary/80 leading-relaxed">
            Your documents remain private and are processed only for your
            Healthfolio.
          </p>
        </Card>
      </div>
    );
  }

  // STATE C: Failure
  if (pageState === "failure") {
    return (
      <div className="flex flex-col items-center justify-center py-12 md:py-20">
        <Card padding="lg" className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error/10">
            <span className="text-3xl" aria-hidden="true">
              ⚠️
            </span>
          </div>

          <h1 className="text-xl font-bold text-text-primary">
            We couldn&apos;t set up your Healthfolio yet
          </h1>

          <p className="mt-3 text-text-secondary">
            Your information has not been lost. Check your connection and try
            again.
          </p>

          {/* Safe error code for development */}
          {errorCode && (
            <p className="mt-2 text-xs font-mono text-text-secondary/60">
              Error: {errorCode}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              onClick={() => {
                setErrorCode(null);
                setPageState("loading");
                window.location.reload();
              }}
            >
              Try again
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              Check connection
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // STATE D: Dashboard (portfolio exists)
  const hasDocuments = documents.length > 0;
  const hasRuns = runs.length > 0;
  const docsNeedingReview = documents.filter(
    (d) => d.status === "review_required"
  );

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        {!hasDocuments ? (
          <>
            <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
              Your Healthfolio is ready
            </h1>
            <p className="mt-2 max-w-lg text-text-secondary">
              Add your first medical document to begin organizing your health
              records.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
              Your health records
            </h1>
            <p className="mt-2 max-w-lg text-text-secondary">
              {documents.length} document{documents.length !== 1 ? "s" : ""} in
              your Healthfolio
            </p>
          </>
        )}
      </div>

      {/* Primary CTA for new users */}
      {!hasDocuments && (
        <Card padding="lg" className="border-primary/20 bg-primary/5">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Upload first document
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Add a medical report, prescription, or scan to get started.
              </p>
            </div>
            {portfolio && (
              <AddRecordButton
                portfolioId={portfolio.id}
                onComplete={(docId) => {
                  window.location.reload();
                }}
              />
            )}
          </div>
        </Card>
      )}

      {/* Next appointment */}
      {nextAppointment && (
        <Card padding="md">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            Next appointment
          </h2>
          <div className="mt-2">
            <p className="font-medium text-text-primary">
              {new Date(nextAppointment.starts_at).toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {nextAppointment.starts_at.includes("T") && (
                <span className="ml-2 text-text-secondary">
                  at{" "}
                  {new Date(
                    nextAppointment.starts_at
                  ).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </p>
            {nextAppointment.specialty && (
              <p className="mt-1 text-sm text-text-secondary">
                {nextAppointment.specialty}
                {nextAppointment.clinician_name &&
                  ` — ${nextAppointment.clinician_name}`}
              </p>
            )}
            {nextAppointment.location && (
              <p className="mt-1 text-sm text-text-secondary">
                {nextAppointment.location}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Records needing review */}
      {docsNeedingReview.length > 0 && (
        <Card padding="md" className="border-warning/20 bg-warning/5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-warning">
                Records needing review
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {docsNeedingReview.length} document
                {docsNeedingReview.length !== 1 ? "s" : ""} need your attention.
              </p>
            </div>
            <Link href="/documents">
              <Button variant="secondary" size="sm">
                Review
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Recent preparations */}
      {hasRuns && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Recent preparations
          </h2>
          <div className="mt-4 space-y-3">
            {runs.map((run) => (
              <Link key={run.id} href={`/runs/${run.id}`}>
                <Card
                  padding="md"
                  className="cursor-pointer transition-colors hover:border-primary/30"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-text-primary">
                        {run.goal}
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {new Date(run.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <Badge
                      variant={
                        run.status === "complete"
                          ? "verified"
                          : run.status === "blocked" ||
                            run.status === "waiting_for_user"
                          ? "review"
                          : run.status === "failed"
                          ? "failed"
                          : "processing"
                      }
                    />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty states for users with portfolio but no data */}
      {!hasDocuments && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card padding="md">
              <p className="text-sm text-text-secondary">
                <span className="text-lg mr-2" aria-hidden="true">
                  📋
                </span>
                No documents uploaded yet
              </p>
            </Card>
            <Card padding="md">
              <p className="text-sm text-text-secondary">
                <span className="text-lg mr-2" aria-hidden="true">
                  📊
                </span>
                Health trends will appear after verified reports are processed
              </p>
            </Card>
            <Card padding="md">
              <p className="text-sm text-text-secondary">
                <span className="text-lg mr-2" aria-hidden="true">
                  💊
                </span>
                Medicines will appear after a prescription is reviewed
              </p>
            </Card>
            <Card padding="md">
              <p className="text-sm text-text-secondary">
                <span className="text-lg mr-2" aria-hidden="true">
                  📅
                </span>
                Your timeline will appear after information is confirmed
              </p>
            </Card>
          </div>
        </div>
      )}

      {/* Empty state for users with documents but no runs */}
      {hasDocuments && !hasRuns && (
        <EmptyState
          icon="📋"
          title="No preparations yet"
          description="Upload records and prepare for an upcoming appointment."
          action={{
            label: "Start preparation",
            onClick: () => {
              window.location.href = "/prepare";
            },
          }}
        />
      )}
    </div>
  );
}
