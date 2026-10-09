"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/auth-client";
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
      // Firebase's own email templates — no SMTP anywhere (parity with the
      // zero-email-infra reality before).
      await sendPasswordResetEmail(auth, parsed.data.email);
      // Always show the calm confirmation regardless of account existence.
      setSent(true);
    } catch (err) {
      const code = (err as { code?: unknown } | null)?.code;
      if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please wait a minute and try again.");
      } else if (code === "auth/internal-error" || code === "auth/server-error") {
        // Server-side failure — no reset email was sent. Never claim it was.
        setError("Something went wrong on our side. Please try again in a few minutes.");
      } else if (typeof code !== "string" || code === "auth/network-request-failed") {
        // Network-level failure (server unreachable).
        setError("We couldn't reach Healthfolio right now. Please check your connection and try again.");
      } else {
        // user-not-found and friends: account existence is never revealed.
        setSent(true);
      }
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
