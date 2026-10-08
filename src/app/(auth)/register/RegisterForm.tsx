"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { RegisterSchema } from "@/lib/auth/schemas";

function calculateAge(dob: string): number | null {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    dob: "",
    gender: "",
    region: "",
    email: "",
    password: "",
  });
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const age = calculateAge(form.dob);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!consent) {
      setError("Please confirm the privacy and care-record consent to continue.");
      return;
    }

    const parsed = RegisterSchema.safeParse({
      ...form,
      gender: form.gender || undefined,
      region: form.region || undefined,
      dob: form.dob,
      consent,
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) {
          errors[key] =
            key === "password"
              ? "Password must be at least 8 characters."
              : key === "dob"
                ? "You must be at least 13 years old to create an account."
                : "Please check this field.";
        }
      }
      setFieldErrors(errors);
      return;
    }

    setLoading(true);

    // Profile fields ride on the sign-up request; the server persists the
    // configured additionalFields (dob/gender/region) and ignores the rest.
    let result: Awaited<ReturnType<typeof signUp.email>>;
    try {
      result = await signUp.email({
        email: form.email.trim(),
        name: form.name.trim(),
        password: form.password,
        callbackURL: "/dashboard",
        fetchOptions: {
          body: {
            dob: form.dob,
            gender: form.gender || undefined,
            region: form.region || undefined,
          },
        },
      });
    } catch {
      // Network-level failure (server unreachable) — never a user-input problem.
      setError("We couldn't reach Healthfolio right now. Please check your connection and try again.");
      setLoading(false);
      return;
    }

    if (result.error) {
      const status = result.error.status;
      if (status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
      } else if (status === 422) {
        setError("An account with this email may already exist. Try signing in instead.");
      } else if (typeof status === "number" && status >= 500) {
        // Server/infrastructure failure — not the user's input.
        setError("Something went wrong on our side. Please try again in a few minutes.");
      } else {
        setError("Could not create the account. Please try again.");
      }
      setLoading(false);
      return;
    }

    // Registration creates the patient role server-side; route there.
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card padding="lg" className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-text-primary">
            Create your Healthfolio
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Your records stay private. Sharing happens only with your consent.
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
            error={fieldErrors.name}
          />
          <div>
            <Input
              label="Date of birth"
              type="date"
              value={form.dob}
              onChange={(e) => update("dob", e.target.value)}
              required
              autoComplete="bday"
              max={new Date().toISOString().slice(0, 10)}
              error={fieldErrors.dob}
            />
            {age !== null && age >= 0 && (
              <p className="mt-1 text-xs text-text-secondary">Age: {age}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="gender"
              className="text-sm font-semibold text-text-primary"
            >
              Gender <span className="font-normal text-text-secondary">(optional)</span>
            </label>
            <select
              id="gender"
              value={form.gender}
              onChange={(e) => update("gender", e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-surface px-3 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </div>
          <Input
            label="Location / region"
            value={form.region}
            onChange={(e) => update("region", e.target.value)}
            autoComplete="address-level1"
            placeholder="Optional"
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
            autoComplete="email"
            error={fieldErrors.email}
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            required
            autoComplete="new-password"
            helpText="At least 8 characters."
            error={fieldErrors.password}
          />

          <label className="flex items-start gap-3 rounded-xl bg-canvas p-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-border accent-primary"
            />
            <span className="text-sm text-text-secondary">
              I consent to Healthfolio storing my records securely and processing
              them to coordinate my care. I understand Healthfolio does not
              diagnose or treat, and sharing with a clinician happens only when I
              approve it.
            </span>
          </label>

          <Button
            type="submit"
            loading={loading}
            loadingText="Creating account…"
            className="w-full"
          >
            Create my Healthfolio
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-text-secondary">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
