"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SkeletonList } from "@/components/ui/Skeletons";

interface ApplicationRow {
  id: string;
  status: string;
  specialty: string;
  created_at: string;
}

/** Live doctor-application review queue for the platform admin console. */
export function PlatformAdminSummary() {
  const [applications, setApplications] = useState<ApplicationRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/staff/admin/roles?view=applications", {
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          setFailed(true);
          setApplications([]);
          return;
        }
        if (!res.ok) {
          setFailed(true);
          setApplications([]);
          return;
        }
        const data = (await res.json()) as { applications?: ApplicationRow[] };
        setApplications(data.applications ?? []);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setApplications([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card padding="lg" className="mt-4">
      <h2 className="text-base font-semibold text-text-primary">
        Doctor applications
      </h2>
      {applications === null ? (
        <div className="mt-3">
          <SkeletonList count={2} />
        </div>
      ) : applications.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">
          {failed
            ? "Could not load applications right now. Please try again later."
            : "No doctor applications yet. Applications appear here when clinicians apply through /doctor/apply."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {applications.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm"
            >
              <span className="text-text-primary">{a.specialty}</span>
              <span className="capitalize text-text-secondary">
                {a.status.replace("_", " ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
