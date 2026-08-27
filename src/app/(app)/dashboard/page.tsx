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

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Load or create portfolio
      const { data: portfolios } = await supabase
        .from("portfolios")
        .select("id, label")
        .eq("user_id", user.id)
        .limit(1);

      if (portfolios && portfolios.length > 0) {
        setPortfolio(portfolios[0]);

        // Load recent runs
        const { data: runData } = await supabase
          .from("agent_runs")
          .select("id, goal, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);

        setRuns(runData || []);
      } else {
        // Create default portfolio
        const { data: newPortfolio } = await supabase
          .from("portfolios")
          .insert({ user_id: user.id, label: "My Healthfolio" })
          .select("id, label")
          .single();

        if (newPortfolio) {
          setPortfolio(newPortfolio);
        } else {
          setError("Could not create your portfolio.");
        }
      }

      setLoading(false);
    }

    loadData();
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
          Overview
        </h1>
        <p className="mt-1 text-text-secondary">
          Your medical record organization at a glance.
        </p>
      </div>

      {/* Primary CTA */}
      <Card padding="lg" className="border-primary/20 bg-primary/5">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Prepare for an appointment
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Upload medical records, extract verified information, and generate
              a consultation brief.
            </p>
          </div>
          <Link href="/prepare">
            <Button>Start preparation</Button>
          </Link>
        </div>
      </Card>

      {/* Recent runs */}
      {runs.length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Recent preparations
          </h2>
          <div className="mt-4 space-y-3">
            {runs.map((run) => (
              <Link key={run.id} href={`/runs/${run.id}`}>
                <Card padding="md" className="hover:border-primary/30 transition-colors cursor-pointer">
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
                          : run.status === "blocked" || run.status === "waiting_for_user"
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
      ) : (
        <EmptyState
          icon="📋"
          title="No preparations yet"
          description="Start by preparing for an upcoming appointment. Upload your medical records and Healthfolio will organize them into a clear timeline."
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
