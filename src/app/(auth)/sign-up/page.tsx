"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        setError(
          "Sign-up is not configured yet. The administrator needs to set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the .env.local file."
        );
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
          setError("An account with this email already exists. Please sign in.");
        } else {
          setError(signUpError.message || "Could not create your account. Please try again.");
        }
        return;
      }

      setSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Something went wrong: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card padding="lg" className="w-full max-w-md text-center">
          <span className="text-4xl" aria-hidden="true">📧</span>
          <h1 className="mt-4 text-xl font-semibold text-text-primary">
            Check your email
          </h1>
          <p className="mt-2 text-text-secondary">
            We sent a verification link to <strong>{email}</strong>. Please check
            your inbox and click the link to activate your account.
          </p>
          <p className="mt-4 text-sm text-text-secondary">
            Didn&apos;t receive it? Check your spam folder or{" "}
            <button
              onClick={handleSubmit}
              className="text-primary hover:underline font-medium"
            >
              resend
            </button>
            .
          </p>
          <Link
            href="/sign-in"
            className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
          >
            Back to sign in
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card padding="lg" className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-text-primary">
            Create your Healthfolio
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Securely organize your medical records and prepare for appointments.
          </p>
        </div>

        {error && (
          <div className="mt-4">
            <ErrorMessage message={error} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="At least 8 characters"
            helpText="Must be at least 8 characters long."
            minLength={8}
          />
          <Button
            type="submit"
            loading={loading}
            loadingText="Creating account…"
            className="w-full"
          >
            Create my Healthfolio
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
