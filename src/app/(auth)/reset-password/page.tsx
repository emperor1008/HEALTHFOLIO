"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

const RESEND_COOLDOWN_MS = 60_000;
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    const stored = sessionStorage.getItem("reset_email_cooldown");
    if (stored) {
      const elapsed = Date.now() - parseInt(stored, 10);
      if (elapsed < RESEND_COOLDOWN_MS) {
        setCooldownRemaining(Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000));
      }
    }
  }, []);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cooldownRemaining > 0) return;

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (resetError) {
        setError("Could not send reset email. Please try again.");
        return;
      }

      setSuccess(true);
      sessionStorage.setItem("reset_email_cooldown", Date.now().toString());
      setCooldownRemaining(60);
    } catch {
      setError("Something went wrong. Please try again.");
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
            We sent a password reset link to <strong>{email}</strong>. Check your
            inbox and follow the instructions.
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
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Enter your email address and we&apos;ll send you a link to reset your password.
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
          <Button
            type="submit"
            loading={loading}
            loadingText="Sending reset link…"
            disabled={cooldownRemaining > 0}
            className="w-full"
          >
            {cooldownRemaining > 0
              ? `Resend in ${cooldownRemaining}s`
              : "Send reset link"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-text-secondary">
          Remember your password?{" "}
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
