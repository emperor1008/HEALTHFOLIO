"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { DoctorApplicationSchema } from "@/lib/auth/schemas";

export default function DoctorApplyPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    licenceNumber: "",
    specialty: "",
    facilityName: "",
    region: "",
  });
  const [attestation, setAttestation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!attestation) {
      setError("Please confirm the attestation to submit your application.");
      return;
    }

    const parsed = DoctorApplicationSchema.safeParse({ ...form, attestation });
    if (!parsed.success) {
      setError("Please complete every field before submitting.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/doctor/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (res.status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
        return;
      }
      if (!res.ok) {
        setError("Could not submit the application. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError(
        "You appear to be offline. Please try again when your connection returns — nothing was lost."
      );
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card padding="lg" className="w-full max-w-md">
          <h1 className="text-xl font-semibold text-text-primary">
            Application received
          </h1>
          <p className="mt-3 text-sm text-text-secondary">
            Your application is <strong className="text-text-primary">under review</strong>{" "}
            by the facility administration. You are not shown as a verified
            doctor until an administrator approves you.
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            You can check the status any time.
          </p>
          <Link
            href="/doctor/application-status"
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            View application status →
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card padding="lg" className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-text-primary">
            Doctor application
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Applying creates a <strong>pending</strong> application only. An
            authorized facility or platform administrator must verify and
            approve it before doctor access is granted.
          </p>
        </div>

        {error && (
          <div className="mt-4">
            <ErrorMessage message={error} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            label="Full name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
            autoComplete="name"
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            label="Professional registration / licence number"
            value={form.licenceNumber}
            onChange={(e) => update("licenceNumber", e.target.value)}
            required
            helpText="Verified privately by administrators; never shown to patients."
          />
          <Input
            label="Specialty"
            value={form.specialty}
            onChange={(e) => update("specialty", e.target.value)}
            required
          />
          <Input
            label="Facility name"
            value={form.facilityName}
            onChange={(e) => update("facilityName", e.target.value)}
            required
          />
          <Input
            label="Region"
            value={form.region}
            onChange={(e) => update("region", e.target.value)}
            required
          />

          <label className="flex items-start gap-3 rounded-xl bg-canvas p-3">
            <input
              type="checkbox"
              checked={attestation}
              onChange={(e) => setAttestation(e.target.checked)}
              required
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-border accent-primary"
            />
            <span className="text-sm text-text-secondary">
              I attest that the information provided is accurate and that I hold
              the stated professional registration.
            </span>
          </label>

          <Button
            type="submit"
            loading={loading}
            loadingText="Submitting…"
            className="w-full"
          >
            Submit application
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-text-secondary">
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
