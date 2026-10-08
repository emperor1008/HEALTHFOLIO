"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { ResetPasswordSchema } from "@/lib/auth/schemas";

function ResetPasswordFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Firebase reset emails land with `?oobCode=` (mode=resetPassword); the
  // older `?token=` link format is still accepted so previous emails work.
  const token = searchParams.get("oobCode") ?? searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [targetEmail, setTargetEmail] = useState<string | null>(null);

  // Validate the code up front and show which account it belongs to.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyPasswordResetCode(auth, token)
      .then((email) => {
        if (!cancelled) setTargetEmail(email);
      })
      .catch(() => {
        // Invalid/expired codes still surface their friendly message when
        // submitted — verification here only decides whether to show the
        // target email.
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = ResetPasswordSchema.safeParse({ token, newPassword });
    if (!parsed.success) {
      setError("Please choose a new password of at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(auth, token, parsed.data.newPassword);
      // All other sessions were revoked server-side after the reset.
      setDone(true);
      setTimeout(() => router.push("/sign-in"), 2500);
    } catch (err) {
      const code = (err as { code?: unknown } | null)?.code;
      if (typeof code !== "string" || code === "auth/network-request-failed") {
        // Network-level failure (server unreachable).
        setError("We couldn't reach Healthfolio right now. Please check your connection and try again.");
      } else if (code === "auth/weak-password") {
        setError("Please choose a new password of at least 8 characters.");
      } else {
        setError(
          "This reset link is invalid or has expired. Please request a new one."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <>
        <ErrorMessage message="This page needs a valid reset link. Please request a new one." />
        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            Request a reset link
          </Link>
        </p>
      </>
    );
  }

  if (done) {
    return (
      <p className="mt-6 text-sm text-text-secondary">
        Your password has been changed and other sessions were signed out.{" "}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Sign in with your new password
        </Link>
      </p>
    );
  }

  return (
    <>
      {error && (
        <div className="mt-4">
          <ErrorMessage message={error} />
        </div>
      )}
      {targetEmail && (
        <p className="mt-4 text-sm text-text-secondary">
          Resetting the password for{" "}
          <span className="font-medium text-text-primary">{targetEmail}</span>.
        </p>
      )}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          autoComplete="new-password"
          helpText="At least 8 characters."
        />
        <Button type="submit" loading={loading} loadingText="Updating…" className="w-full">
          Set new password
        </Button>
      </form>
    </>
  );
}

export function ResetPasswordForm() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card padding="lg" className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-text-primary">
            Choose a new password
          </h1>
        </div>
        <Suspense fallback={<p className="mt-6 text-sm text-text-secondary">Loading…</p>}>
          <ResetPasswordFormContent />
        </Suspense>
      </Card>
    </div>
  );
}
