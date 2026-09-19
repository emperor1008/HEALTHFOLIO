"use client";

/**
 * Staff console (Part 3): clinician availability + assigned queue.
 *
 * HONEST STATE: when the signed-in user has no staff role (the normal case in
 * this deployment — roles are admin-key assigned, never self-service), this
 * screen says so plainly and invents nothing: no demo doctors, no fake queue.
 */
import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { t3 } from "@/lib/i18n/part3";
import { PageTransition } from "@/components/ui/PageTransition";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

interface Profile {
  display_name: string;
  specialty: string;
  availability_state: "available" | "busy" | "offline";
  max_active_requests: number;
  updated_at: string;
}

export default function StaffPage() {
  const { language } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const tt = useCallback(
    (key: Parameters<typeof t3>[1]) => t3(language, key),
    [language]
  );

  useEffect(() => {
    let alive = true;
    fetch("/api/clinicians/me/availability")
      .then(async (r) => {
        if (r.status === 403) return { configured: false as const };
        if (!r.ok) return { configured: false as const };
        const data = (await r.json()) as { profile?: Profile | null };
        return { configured: true as const, profile: data.profile ?? null };
      })
      .then((v) => {
        if (!alive) return;
        setConfigured(v.configured);
        setProfile("profile" in v ? v.profile ?? null : null);
      })
      .catch(() => {
        if (alive) setConfigured(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const setAvailability = useCallback(
    async (state: Profile["availability_state"]) => {
      setSaving(true);
      try {
        await fetch("/api/clinicians/me/availability", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ availability_state: state }),
        });
        setProfile((p) => (p ? { ...p, availability_state: state, updated_at: new Date().toISOString() } : p));
      } finally {
        setSaving(false);
      }
    },
    []
  );

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
        <h1 className="text-2xl font-semibold text-text-primary">{tt("availabilityControls")}</h1>

        {configured === null && <p className="mt-4 text-sm text-text-secondary">…</p>}

        {configured === false && (
          <Card padding="md" className="mt-4">
            <p className="font-medium text-text-primary">{tt("staffNotConfigured")}</p>
            <p className="mt-1 text-sm text-text-secondary">{tt("staffNotConfiguredHint")}</p>
          </Card>
        )}

        {configured === true && profile && (
          <>
            <Card padding="md" className="mt-4">
              <p className="font-medium text-text-primary">{profile.display_name}</p>
              <p className="text-sm text-text-secondary">
                {tt("clinicianSpecialty")}: {profile.specialty} · {tt("statusLabel")}:{" "}
                {profile.availability_state}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["available", "busy", "offline"] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={profile.availability_state === s ? "primary" : "secondary"}
                    disabled={saving}
                    onClick={() => void setAvailability(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
              <p className="mt-2 text-xs text-text-secondary">{freshnessText(profile.updated_at, tt)}</p>
            </Card>
            <Card padding="md" className="mt-4">
              <p className="font-medium text-text-primary">{tt("assignedQueue")}</p>
              <p className="mt-1 text-sm text-text-secondary">{tt("staffNotConfiguredHint")}</p>
            </Card>
          </>
        )}
      </main>
    </PageTransition>
  );
}

function freshnessText(updatedAt: string, tt: (key: Parameters<typeof t3>[1], vars?: Record<string, string | number>) => string): string {
  const minutes = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60_000);
  if (minutes < 1) return tt("updatedJustNow");
  return tt("updatedMinutesAgo", { count: minutes });
}
