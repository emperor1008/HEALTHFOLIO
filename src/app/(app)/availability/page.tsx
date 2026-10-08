"use client";

/** Patient available-doctor screen (Phase 3). */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { t3 } from "@/lib/i18n/part3";
import { useSync } from "@/lib/offline/sync-provider";
import { Card } from "@/components/ui/Card";

type Option = {
  clinicianId: string;
  displayName: string;
  specialty: string;
  languages: string[];
};

export default function AvailabilityPage() {
  const { language } = useLanguage();
  const { online } = useSync();
  const [options, setOptions] = useState<Option[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setStale(false);
    fetch("/api/clinicians/me/care-options")
      .then((r) => r.json())
      .then((d) => {
        setOptions(d.options ?? null);
        setStale(Boolean(d.stale));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        {t3(language, "hospitalFound")}
      </h1>
      {!online && (
        <p
          role="status"
          className="mt-3 rounded-md bg-sage-50 px-4 py-3 text-sm text-forest-900"
        >
          {t3(language, "offlineAvailability")}
        </p>
      )}
      {loading && <p role="status">{t3(language, "lookingForDoctor")}</p>}
      {!loading && !stale && !options && (
        <Card>{t3(language, "noClinicianMatch")}</Card>
      )}
      {!loading && !stale && options && options.length === 0 && (
        <Card>{t3(language, "noAvailableDoctors")}</Card>
      )}
      {options && options.length > 0 && (
        <div className="mt-4 space-y-3">
          {options.map((o) => (
            <Card
              key={o.clinicianId}
              className="flex flex-wrap items-start justify-between gap-3"
            >
              <div>
                <p className="font-medium text-text-primary">{o.displayName}</p>
                <p className="text-sm text-text-secondary">{o.specialty}</p>
                <p className="text-xs text-text-tertiary">
                  {o.languages.join(", ")}
                </p>
              </div>
              <Link
                href={"/care-requests/new?clinicianId=" + o.clinicianId}
                className="inline-flex min-h-[44px] items-center rounded-input bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {t3(language, "requestConsultation")}
              </Link>
            </Card>
          ))}
        </div>
      )}
      {stale && (
        <p className="mt-3 text-xs text-text-tertiary">
          {t3(language, "staleAvailability")}
        </p>
      )}
    </div>
  );
}
