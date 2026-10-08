"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { ForgotPasswordSchema } from "@/lib/auth/schemas";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = ForgotPasswordSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const { error: resetError } = await authClient.requestPasswordReset({
        email: parsed.data.email,
        redirectTo: "/reset-password",
      });
      if (resetError && resetError.status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
        return;
      }
      if (
        resetError &&
        typeof resetError.status === "number" &&
        resetError.status >= 500
      ) {
        // Server-side failure — no reset email was sent. Never claim it was.
        setError("Something went wrong on our side. Please try again in a few minutes.");
        return;
      }
      // Always show the calm confirmation regardless of account existence.
      setSent(true);
    } catch {
      // Network-level failure (server unreachable).
      setError("We couldn't reach Healthfolio right now. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card padding="lg" className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-text-primary">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>

        {sent ? (
          <>
            <p className="mt-6 text-sm text-text-secondary">
              If an account exists for that email, a reset link is on its way.
              The link stops working after a short time and can be used once.
            </p>
            <p className="mt-4 text-center text-sm">
              <Link href="/sign-in" className="font-medium text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </>
        ) : (
          <>
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
              />
              <Button type="submit" loading={loading} loadingText="Sending…" className="w-full">
                Send reset link
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-text-secondary">
              <Link href="/sign-in" className="font-medium text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
