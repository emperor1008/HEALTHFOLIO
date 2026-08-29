"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { EmptyState } from "@/components/ui/EmptyState";
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

const STEP_INTERVAL_MS = 3000;
const MAX_POLL_INTERVAL_MS = 15000;

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.runId as string;

  const [run, setRun] = useState<AgentRun | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [stepping, setStepping] = useState(false);
  const [autoStepping, setAutoStepping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAgentDetails, setShowAgentDetails] = useState(false);
  const autoStepRef = useRef<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
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

  // Auto-stepping: poll with backoff, stop when inactive
  useEffect(() => {
    if (!run) return;
    const isActive = run.status === "running";

    // Stop polling immediately if run is not active
    if (!isActive || !autoStepping || stepping) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    let pollInterval = STEP_INTERVAL_MS;
    let consecutiveFailures = 0;
    let cancelled = false;

    function scheduleNext() {
      if (cancelled) return;
      intervalRef.current = setTimeout(async () => {
        if (cancelled || autoStepRef.current) {
          if (!cancelled) scheduleNext();
          return;
        }
        autoStepRef.current = true;

        try {
          const supabase = createClient();
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session) {
            if (!cancelled) scheduleNext();
            return;
          }

          const response = await fetch(`/api/runs/${runId}/step`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
          });

          const result = await response.json();
          consecutiveFailures = 0;
          pollInterval = STEP_INTERVAL_MS;

          if (result.data) {
            await loadData();

            if (
              result.data.requiresUserAction ||
              result.data.phase === "complete"
            ) {
              setAutoStepping(false);
              return;
            }
          }
        } catch {
          consecutiveFailures++;
          pollInterval = Math.min(
            pollInterval * 1.5,
            MAX_POLL_INTERVAL_MS
          );
        } finally {
          autoStepRef.current = false;
        }

        if (!cancelled) scheduleNext();
      }, pollInterval);
    }

    scheduleNext();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [run?.status, autoStepping, stepping, runId, loadData]);

  // Start auto-stepping when run is active
  useEffect(() => {
    if (run?.status === "running" && !autoStepping) {
      setAutoStepping(true);
    }
  }, [run?.status]);

  async function handleStep() {
    setStepping(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
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
  const isWaitingForUser = run.status === "waiting_for_user";

  // Compute agent evaluation metrics from steps
  const succeededSteps = steps.filter((s) => s.tool_status === "succeeded");
  const failedSteps = steps.filter((s) => s.tool_status === "failed");
  const recoveredSteps = steps.filter(
    (s) => s.tool_status === "succeeded" && s.public_summary.includes("Retrying")
  );

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
              Started{" "}
              {new Date(run.created_at).toLocaleDateString("en-IN", {
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
                : isBlocked || isWaitingForUser
                ? "review"
                : run.status === "failed"
                ? "failed"
                : "processing"
            }
          />
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      {/* Processing status */}
      {isActive && (
        <Card padding="lg" className="border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3">
            <Spinner size="sm" />
            <div>
              <p className="font-medium text-text-primary">
                {isWaitingForUser
                  ? "Waiting for your review"
                  : "Processing your documents..."}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Step {run.current_step} —{" "}
                {steps.length > 0
                  ? steps[steps.length - 1].public_summary
                  : "Initializing..."}
              </p>
            </div>
          </div>
        </Card>
      )}

      {isBlocked && (
        <Card padding="lg" className="border-warning/20 bg-warning/5">
          <p className="font-medium text-warning">
            Processing is waiting for input.
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Some extracted information needs your review before processing can continue.
          </p>
          <div className="mt-3">
            <Link href="/review">
              <Button size="sm">Review extracted information</Button>
            </Link>
          </div>
        </Card>
      )}

      {isComplete && (
        <Card padding="lg" className="border-success/20 bg-success/5">
          <p className="font-medium text-success">Processing complete.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/preparation">
              <Button size="sm">View brief</Button>
            </Link>
            <Link href="/timeline">
              <Button variant="secondary" size="sm">
                View timeline
              </Button>
            </Link>
            <Link href="/documents">
              <Button variant="ghost" size="sm">
                View documents
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* How Healthfolio worked — collapsed by default */}
      <div>
        <button
          onClick={() => setShowAgentDetails(!showAgentDetails)}
          className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className={`transition-transform ${showAgentDetails ? "rotate-90" : ""}`}
          >
            <path
              d="M6 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          How Healthfolio worked
        </button>

        {showAgentDetails && (
          <Card padding="lg" className="mt-3">
            {/* Activity timeline */}
            <div className="space-y-4">
              {steps.map((step) => (
                <div key={step.id} className="flex gap-3">
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
            </div>

            {/* Agent evaluation */}
            {steps.length > 0 && (
              <div className="mt-6 border-t border-border pt-4">
                <h3 className="text-sm font-semibold text-text-primary">
                  Agent Evaluation
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-text-secondary">Actions completed</p>
                    <p className="font-medium text-text-primary">
                      {succeededSteps.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-secondary">Failed actions</p>
                    <p className="font-medium text-text-primary">
                      {failedSteps.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-secondary">Recovered</p>
                    <p className="font-medium text-text-primary">
                      {recoveredSteps.length}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Actions */}
      {(isActive || isBlocked) && (
        <div className="flex gap-3">
          {!isWaitingForUser && (
            <Button
              onClick={handleStep}
              loading={stepping}
              loadingText="Processing..."
            >
              {autoStepping ? "Auto-processing..." : "Continue processing"}
            </Button>
          )}
          {autoStepping && !isWaitingForUser && (
            <Button
              variant="ghost"
              onClick={() => setAutoStepping(false)}
            >
              Pause
            </Button>
          )}
          {!autoStepping && isActive && !isWaitingForUser && (
            <Button
              variant="ghost"
              onClick={() => setAutoStepping(true)}
            >
              Resume auto-processing
            </Button>
          )}
          <Link href="/dashboard">
            <Button variant="secondary">Back to overview</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
