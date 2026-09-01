/**
 * Feature 6: Medication Routine Plan Confirmation Screen
 *
 * Shows extracted schedule details, source evidence, proposed reminder times,
 * and requires user confirmation before activating.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

interface ScheduleRule {
  id: string;
  rule_type: string;
  local_time: string | null;
  interval_hours: number | null;
  weekdays: number[] | null;
  start_date: string | null;
  end_date: string | null;
  timing_relation: string | null;
  source_type: string;
  source_text: string | null;
  user_confirmed: boolean;
}

interface MedicationPlan {
  id: string;
  user_id: string;
  medicine_entity_id: string | null;
  prescription_item_id: string;
  document_id: string;
  display_name: string;
  source_instruction: string;
  plan_type: string;
  status: string;
  timezone: string | null;
  start_date: string | null;
  end_date: string | null;
  confidence: number;
  requires_review: boolean;
  created_at: string;
}

const PLAN_TYPE_LABELS: Record<string, string> = {
  fixed_times: "Fixed times",
  times_per_day: "Times per day",
  interval: "Every few hours",
  specific_weekdays: "Specific weekdays",
  date_range: "Date range",
  course_duration: "Course duration",
  tapering: "Tapering schedule",
  as_needed: "As-needed",
  one_time: "One-time dose",
  unclear: "Needs review",
};

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIMEZONE_OPTIONS = [
  "Asia/Kolkata",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export default function PlanConfirmationPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.planId as string;

  const [plan, setPlan] = useState<MedicationPlan | null>(null);
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Editable fields
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [timeSlots, setTimeSlots] = useState<
    Array<{ ruleId: string; time: string; confirmed: boolean }>
  >([]);

  const loadPlan = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/routines?planId=${planId}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to load plan");

      setPlan(data.plan);
      setRules(data.rules || []);

      // Initialize time slots from rules
      const slots = (data.rules || [])
        .filter((r: ScheduleRule) => r.local_time)
        .map((r: ScheduleRule) => ({
          ruleId: r.id,
          time: r.local_time || "08:00",
          confirmed: r.source_type === "prescription",
        }));
      setTimeSlots(slots);

      if (data.plan.timezone) {
        setTimezone(data.plan.timezone);
      }
      if (data.plan.start_date) {
        setStartDate(data.plan.start_date);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plan");
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const handleTimeChange = (index: number, newTime: string) => {
    setTimeSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, time: newTime } : s))
    );
  };

  const handleConfirmSlot = (index: number) => {
    setTimeSlots((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, confirmed: true } : s
      )
    );
  };

  const handleActivate = async () => {
    if (!plan) return;

    const confirmedSlots = timeSlots.filter((s) => s.confirmed);
    if (confirmedSlots.length === 0) {
      setError("Please confirm at least one reminder time before activating.");
      return;
    }

    setActivating(true);
    setError(null);

    try {
      const res = await fetch("/api/routines/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          confirmedTimeSlots: confirmedSlots.map((s) => ({
            ruleId: s.ruleId,
            localTime: s.time,
            userConfirmed: true,
          })),
          startDate,
          timezone,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to activate plan");

      setSuccess(true);
      setTimeout(() => router.push("/routine"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to activate plan");
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-zinc-500">Loading plan details…</div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Routine activated
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Your medication reminders are now active. Redirecting…
        </p>
      </div>
    );
  }

  if (error && !plan) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-2 text-sm text-red-600 hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
        Confirm medication routine
      </h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Review the extracted schedule and confirm your reminder times.
      </p>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
        </div>
      )}

      {plan && (
        <div className="space-y-6">
          {/* Medicine Identity */}
          <section className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              Medicine
            </h2>
            <p className="text-zinc-700 dark:text-zinc-300 font-medium">
              {plan.display_name}
            </p>
            {plan.plan_type && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Type: {PLAN_TYPE_LABELS[plan.plan_type] || plan.plan_type}
              </p>
            )}
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Confidence: {Math.round(plan.confidence * 100)}%
            </p>
          </section>

          {/* Source Instruction */}
          <section className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
              Prescription instruction
            </h2>
            <p className="text-zinc-700 dark:text-zinc-300 italic">
              &ldquo;{plan.source_instruction}&rdquo;
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
              This is the exact text extracted from your prescription document.
            </p>
          </section>

          {/* Reminder Times */}
          {timeSlots.length > 0 && (
            <section className="bg-white dark:bg-zinc-800 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700">
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                Reminder times
              </h2>
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                These reminder times may have been suggested for convenience and
                were not necessarily written on the prescription. Confirm each
                time.
              </p>
              <div className="space-y-3">
                {timeSlots.map((slot, i) => (
                  <div
                    key={slot.ruleId}
                    className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-700/50"
                  >
                    <input
                      type="time"
                      value={slot.time}
                      onChange={(e) => handleTimeChange(i, e.target.value)}
                      className="px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                      aria-label={`Reminder time ${i + 1}`}
                    />
                    <button
                      onClick={() => handleConfirmSlot(i)}
                      disabled={slot.confirmed}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        slot.confirmed
                          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                          : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
                      }`}
                    >
                      {slot.confirmed ? "Confirmed" : "Confirm"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Timezone and Dates */}
          <section className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 border border-zinc-200 dark:border-zinc-700">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
              Schedule settings
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Start date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              {plan.end_date && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  End date: {plan.end_date}
                </p>
              )}
            </div>
          </section>

          {/* Safety Disclaimer */}
          <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-3 text-xs text-zinc-500 dark:text-zinc-400">
            Healthfolio helps organize your medication reminders. It does not
            prescribe, recommend, or adjust any medicine. Follow your
            clinician&apos;s instructions.
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => router.back()}
              className="flex-1 px-4 py-3 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Go back
            </button>
            <button
              onClick={handleActivate}
              disabled={activating || timeSlots.every((s) => !s.confirmed)}
              className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 disabled:dark:bg-zinc-700 text-white rounded-lg font-medium transition-colors"
            >
              {activating ? "Activating…" : "Activate routine"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
