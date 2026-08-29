"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";

interface Portfolio {
  id: string;
  label: string;
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

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [nextAppointment, setNextAppointment] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || cancelled) return;

      // Load or create portfolio first
      const { data: portfolios } = await supabase
        .from("portfolios")
        .select("id, label")
        .eq("user_id", user.id)
        .limit(1);

      if (cancelled) return;

      let portfolioId: string | null = null;

      if (portfolios && portfolios.length > 0) {
        setPortfolio(portfolios[0]);
        portfolioId = portfolios[0].id;
      } else {
        const { data: newPortfolio } = await supabase
          .from("portfolios")
          .insert({ user_id: user.id, label: "My Healthfolio" })
          .select("id, label")
          .single();

        if (cancelled) return;

        if (newPortfolio) {
          setPortfolio(newPortfolio);
          portfolioId = newPortfolio.id;
        } else {
          setError("Could not create your portfolio.");
          setLoading(false);
          return;
        }
      }

      // Parallel fetch: documents, runs, and appointment
      const [docsResult, runsResult, apptResult] = await Promise.all([
        supabase
          .from("documents")
          .select("id, original_name, status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("agent_runs")
          .select("id, goal, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("appointments")
          .select("id, starts_at, specialty, clinician_name, location")
          .eq("user_id", user.id)
          .eq("status", "planned")
          .order("starts_at", { ascending: true })
          .limit(1)
          .single(),
      ]);

      if (cancelled) return;

      setDocuments(docsResult.data || []);
      setRuns(runsResult.data || []);
      setNextAppointment(apptResult.data);
      setLoading(false);
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <Card padding="lg">
          <div className="text-center text-error">{error}</div>
        </Card>
      </div>
    );
  }

  const hasDocuments = documents.length > 0;
  const hasRuns = runs.length > 0;
  const docsNeedingReview = documents.filter(
    (d) => d.status === "review_required"
  );

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
          {hasDocuments
            ? "Your health records"
            : "Your health records, clearly organized."}
        </h1>
        {!hasDocuments && (
          <p className="mt-2 max-w-lg text-text-secondary">
            Upload your reports and prescriptions. Healthfolio will organize
            them and help you prepare for your next consultation.
          </p>
        )}
      </div>

      {/* Primary CTA for new users */}
      {!hasDocuments && (
        <Card padding="lg" className="border-primary/20 bg-primary/5">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Upload health records
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Get started by uploading your medical documents.
              </p>
            </div>
            <Link href="/prepare">
              <Button>Upload health records</Button>
            </Link>
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
                  {new Date(nextAppointment.starts_at).toLocaleTimeString("en-IN", {
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
