"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";

interface TimelineEvent {
  id: string;
  event_date: string | null;
  event_type: string;
  title: string;
  description: string;
  source_extraction_ids: string[];
  verification_status: string;
  created_at: string;
}

const EVENT_TYPE_ICONS: Record<string, string> = {
  consultation: "🏥",
  test: "🔬",
  report: "📋",
  prescription: "💊",
  discharge: "📝",
  follow_up: "📅",
  other: "📄",
};

export default function TimelinePage() {
  const router = useRouter();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTimeline() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: timelineEvents } = await supabase
        .from("medical_events")
        .select("*")
        .eq("user_id", user.id)
        .order("event_date", { ascending: true });

      setEvents(timelineEvents || []);
      setLoading(false);
    }

    loadTimeline();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
          Health Timeline
        </h1>
        <p className="mt-1 text-text-secondary">
          A chronological view of your verified medical records.
        </p>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon="📅"
          title="No timeline events yet"
          description="Upload and verify medical documents to build your health timeline."
          action={{
            label: "Start preparation",
            onClick: () => router.push("/prepare"),
          }}
        />
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-border md:left-6" />

          <div className="space-y-6">
            {events.map((event, index) => (
              <div key={event.id} className="relative flex gap-4 pl-2 md:pl-3">
                {/* Timeline dot */}
                <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface border-2 border-border text-sm md:h-10 md:w-10">
                  {EVENT_TYPE_ICONS[event.event_type] || "📄"}
                </div>

                {/* Event card */}
                <Card padding="md" className="flex-1 min-w-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-text-primary truncate">
                          {event.title}
                        </h3>
                        <Badge
                          variant={
                            event.verification_status === "verified"
                              ? "verified"
                              : event.verification_status === "incomplete"
                              ? "review"
                              : "default"
                          }
                        />
                      </div>
                      <p className="mt-1 text-sm text-text-secondary line-clamp-2">
                        {event.description}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium text-text-primary">
                        {event.event_date
                          ? new Date(event.event_date).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : (
                            <span className="text-warning">Date unknown</span>
                          )}
                      </p>
                      <p className="text-xs text-text-secondary capitalize">
                        {event.event_type.replace("_", " ")}
                      </p>
                    </div>
                  </div>
                  {event.source_extraction_ids.length > 0 && (
                    <p className="mt-2 text-xs text-text-secondary">
                      Sources: {event.source_extraction_ids.length} extraction{event.source_extraction_ids.length !== 1 ? "s" : ""}
                    </p>
                  )}
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
