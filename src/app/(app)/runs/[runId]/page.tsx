"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import Link from "next/link";

interface AgentStep {
  id: string;
  sequence: number;
  phase: string;
  public_summary: string;
  tool_name: string | null;
  tool_status: string;
  error_code: string | null;
  created_at: string;
}

interface AgentRun {
  id: string;
  goal: string;
  status: string;
  current_step: number;
  created_at: string;
  completed_at: string | null;
}

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;

  const [run, setRun] = useState<AgentRun | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [stepping, setStepping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: runData } = await supabase
      .from("agent_runs")
      .select("id, goal, status, current_step, created_at, completed_at")
      .eq("id", runId)
      .eq("user_id", user.id)
      .single();

    if (runData) setRun(runData);

    const { data: stepsData } = await supabase
      .from("agent_steps")
      .select("*")
      .eq("run_id", runId)
      .eq("user_id", user.id)
      .order("sequence", { ascending: true });

    setSteps(stepsData || []);
    setLoading(false);
  }, [runId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleStep() {
    setStepping(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/runs/${runId}/step`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error.message);
        return;
      }

      // Reload data
      await loadData();
    } catch {
      setError("Step execution failed. Please try again.");
    } finally {
      setStepping(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="py-8">
        <ErrorMessage message="Run not found." />
      </div>
    );
  }

  const isActive = run.status === "running" || run.status === "waiting_for_user";
  const isBlocked = run.status === "blocked";
  const isComplete = run.status === "complete";

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Link href="/dashboard" className="hover:text-primary">
            Overview
          </Link>
          <span>/</span>
          <span>Run</span>
        </div>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
              {run.goal}
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Started {new Date(run.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <Badge
            variant={
              isComplete
                ? "verified"
                : isBlocked || run.status === "waiting_for_user"
                ? "review"
                : run.status === "failed"
                ? "failed"
                : "processing"
            }
          />
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      {/* Agent activity timeline */}
      <Card padding="lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            Agent Activity
          </h2>
          <span className="text-sm text-text-secondary">
            Step {run.current_step}
          </span>
        </div>

        <div className="mt-6 space-y-4">
          {steps.map((step) => (
            <div
              key={step.id}
              className="flex gap-3"
            >
              {/* Step indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={[
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    step.tool_status === "succeeded"
                      ? "bg-success/10 text-success"
                      : step.tool_status === "failed"
                      ? "bg-error/10 text-error"
                      : step.tool_status === "blocked"
                      ? "bg-warning/10 text-warning"
                      : "bg-info/10 text-info",
                  ].join(" ")}
                >
                  {step.sequence}
                </div>
                <div className="h-full w-px bg-border" />
              </div>

              {/* Step content */}
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium uppercase text-text-secondary">
                    {step.phase}
                  </span>
                  {step.tool_name && (
                    <span className="rounded bg-canvas px-1.5 py-0.5 text-xs text-text-secondary">
                      {step.tool_name}
                    </span>
                  )}
                  <Badge
                    variant={
                      step.tool_status === "succeeded"
                        ? "verified"
                        : step.tool_status === "failed"
                        ? "failed"
                        : step.tool_status === "blocked"
                        ? "review"
                        : "processing"
                    }
                    className="text-[10px]"
                  />
                </div>
                <p className="mt-1 text-sm text-text-primary">
                  {step.public_summary}
                </p>
                {step.error_code && (
                  <p className="mt-1 text-xs text-error">
                    Error: {step.error_code}
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Current status */}
          {isActive && (
            <div className="flex items-center gap-3 text-sm text-text-secondary">
              <Spinner size="sm" />
              <span>Waiting for next step…</span>
            </div>
          )}
          {isBlocked && (
            <div className="rounded-card bg-warning/5 border border-warning/20 p-4">
              <p className="text-sm font-medium text-warning">
                Processing is waiting for input.
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Some actions require your review or correction before proceeding.
              </p>
            </div>
          )}
          {isComplete && (
            <div className="rounded-card bg-success/5 border border-success/20 p-4">
              <p className="text-sm font-medium text-success">
                Processing complete.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/preparation">
                  <Button size="sm">View brief</Button>
                </Link>
                <Link href="/timeline">
                  <Button variant="secondary" size="sm">View timeline</Button>
                </Link>
                <Link href="/documents">
                  <Button variant="ghost" size="sm">View documents</Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Actions */}
      {(isActive || isBlocked) && (
        <div className="flex gap-3">
          <Button onClick={handleStep} loading={stepping} loadingText="Processing…">
            Continue processing
          </Button>
          <Link href="/dashboard">
            <Button variant="secondary">Back to overview</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
