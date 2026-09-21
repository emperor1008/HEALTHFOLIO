"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import {
  PLAN_STATUS_LABELS,
  OCCURRENCE_STATUS_LABELS,
  MISSED_DOSE_MESSAGE,
  SAFETY_DISCLAIMER,
} from "@/lib/routines/types";

interface TodayOccurrence {
  id: string;
  medication_plan_id: string;
  local_scheduled_time: string;
  scheduled_for: string;
  status: string;
  notification_status: string;
  due_window_end: string;
  medication_plans: {
    display_name: string;
    source_instruction: string;
  } | null;
}

interface Plan {
  id: string;
  display_name: string;
  source_instruction: string;
  plan_type: string;
  status: string;
  confidence: number;
  requires_review: boolean;
  start_date: string | null;
  end_date: string | null;
  activated_at: string | null;
  prescription_items: {
    medicine_name: string | null;
    dose_text: string | null;
    instruction_text: string | null;
  } | null;
}

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

function getOccurrenceStatusColor(status: string): string {
  switch (status) {
    case "taken": return "text-success";
    case "skipped": return "text-text-secondary";
    case "snoozed": return "text-warning";
    case "missed": return "text-error";
    case "due": return "text-primary font-semibold";
    default: return "text-text-secondary";
  }
}

export default function RoutinePage() {
  const [todayOccurrences, setTodayOccurrences] = useState<TodayOccurrence[]>([]);
  const [activePlans, setActivePlans] = useState<Plan[]>([]);
  const [reviewPlans, setReviewPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRoutine = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("AUTH_REQUIRED"); setLoading(false); return; }

      const response = await fetch("/api/routines");
      const json = await response.json();

      if (json.error) {
        setError(json.error.code);
      } else {
        setTodayOccurrences(json.data.today || []);
        setActivePlans(json.data.activePlans || []);
        setReviewPlans(json.data.reviewPlans || []);
      }
    } catch {
      setError("NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRoutine(); }, [loadRoutine]);

  const handleOccurrenceAction = async (
    occurrenceId: string,
    action: "taken" | "skipped" | "snoozed" | "not_now"
  ) => {
    setActionLoading(occurrenceId);
    try {
      const clientRequestId = crypto.randomUUID();
      const response = await fetch(`/api/routines/occurrences/${occurrenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          clientRequestId,
        }),
      });

      if (response.ok) {
        await loadRoutine();
      }
    } catch {
      // Silent — UI remains in current state
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>;
  }

  if (error) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">Medication Routine</h1>
        <EmptyState
          icon="⚠️"
          title="We couldn't load your medication routine"
          description="Check your connection and try again."
          action={{ label: "Try again", onClick: loadRoutine }}
        />
      </div>
    );
  }

  const hasData = todayOccurrences.length > 0 || activePlans.length > 0 || reviewPlans.length > 0;
  const pendingOccurrences = todayOccurrences.filter(
    (o) => o.status === "scheduled" || o.status === "due" || o.status === "snoozed"
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">Medication Routine</h1>
        <p className="mt-1 text-text-secondary">Today&apos;s schedule and active routines</p>
      </div>

      {/* Empty state */}
      {!hasData && (
        <EmptyState
          icon="💊"
          title="No medication routines yet"
          description="Upload and review a prescription to create reminder routines."
          action={{
            label: "Add prescription",
            onClick: () => { window.location.href = "/prepare"; },
          }}
        />
      )}

      {/* Today's schedule */}
      {todayOccurrences.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Today</h2>
          <div className="mt-4 space-y-3">
            {todayOccurrences.map((occ) => {
              const isPending = occ.status === "scheduled" || occ.status === "due" || occ.status === "snoozed";
              return (
                <Card key={occ.id} padding="md" className={isPending ? "border-primary/20" : ""}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-text-primary">
                        {occ.medication_plans?.display_name || "Medicine"}
                      </p>
                      <p className="mt-0.5 text-sm text-text-secondary">
                        {formatTime(occ.scheduled_for)}
                      </p>
                      {occ.medication_plans?.source_instruction && (
                        <p className="mt-1 text-xs text-text-secondary line-clamp-1">
                          {occ.medication_plans.source_instruction}
                        </p>
                      )}
                    </div>
                    <span className={`text-sm font-medium ${getOccurrenceStatusColor(occ.status)}`}>
                      {OCCURRENCE_STATUS_LABELS[occ.status as keyof typeof OCCURRENCE_STATUS_LABELS] || occ.status}
                    </span>
                  </div>
                  {isPending && (
                    <div className="mt-3 flex gap-2 flex-wrap">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={actionLoading === occ.id}
                        onClick={() => handleOccurrenceAction(occ.id, "taken")}
                      >
                        Taken
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={actionLoading === occ.id}
                        onClick={() => handleOccurrenceAction(occ.id, "skipped")}
                      >
                        Skip
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={actionLoading === occ.id}
                        onClick={() => handleOccurrenceAction(occ.id, "snoozed")}
                      >
                        Snooze
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={actionLoading === occ.id}
                        onClick={() => handleOccurrenceAction(occ.id, "not_now")}
                      >
                        Not now
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Needs confirmation */}
      {reviewPlans.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Needs confirmation</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {reviewPlans.length} routine{reviewPlans.length !== 1 ? "s" : ""} need your review before reminders begin.
          </p>
          <div className="mt-4 space-y-3">
            {reviewPlans.map((plan) => (
              <Card key={plan.id} padding="md" className="border-warning/20 bg-warning/5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text-primary">{plan.display_name}</p>
                    <p className="mt-0.5 text-sm text-text-secondary">{plan.source_instruction}</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {plan.plan_type.replace(/_/g, " ")} · {PLAN_STATUS_LABELS[plan.status as keyof typeof PLAN_STATUS_LABELS]}
                    </p>
                  </div>
                  <Link href={`/routine/${plan.id}`}><Button variant="primary" size="sm">Review</Button></Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Active routines */}
      {activePlans.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Active routines</h2>
          <div className="mt-4 space-y-3">
            {activePlans.map((plan) => (
              <Card key={plan.id} padding="md" className="cursor-pointer transition-colors hover:border-primary/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text-primary">{plan.display_name}</p>
                    <p className="mt-0.5 text-sm text-text-secondary">{plan.source_instruction}</p>
                    <p className="mt-1 text-xs text-text-secondary">
                      {plan.plan_type.replace(/_/g, " ")} · Since {plan.activated_at ? new Date(plan.activated_at).toLocaleDateString("en-IN") : "—"}
                    </p>
                  </div>
                  <span className="text-xs text-success font-medium">Active</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Safety notice */}
      <Card padding="md" className="border-border/50 bg-canvas/50">
        <p className="text-xs text-text-secondary leading-relaxed">
          {SAFETY_DISCLAIMER}
        </p>
        <p className="mt-2 text-xs text-text-secondary leading-relaxed">
          Reminder times marked &quot;suggested&quot; were proposed for convenience and are not prescription instructions.
        </p>
      </Card>
    </div>
  );
}
