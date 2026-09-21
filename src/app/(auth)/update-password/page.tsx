"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Establish the recovery session from the URL hash
  useEffect(() => {
    async function handleRecovery() {
      try {
        const supabase = await createClient();

        // Supabase sends a hash fragment with access_token and refresh_token
        // for password recovery. The SSR client needs to exchange this.
        const hashParams = new URLSearchParams(
          window.location.hash.substring(1)
        );
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error: sessionError } =
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

          if (sessionError) {
            setSessionError(
              "This password reset link has expired or is invalid. Please request a new one."
            );
            return;
          }
          setSessionReady(true);
        } else {
          // Try to get existing session (user may have navigated back)
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session) {
            setSessionReady(true);
          } else {
            setSessionError(
              "This password reset link is invalid or has expired. Please request a new one."
            );
          }
        }
      } catch {
        setSessionError(
          "Could not verify your reset link. Please request a new one."
        );
      }
    }

    handleRecovery();
  }, []);

  function validatePasswords(): string | null {
    if (password.length < 8) {
      return "Password must be at least 8 characters long.";
    }
    if (password !== confirmPassword) {
      return "Passwords do not match.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validationError = validatePasswords();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = await createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        if (updateError.message.includes("same password")) {
          setError(
            "New password must be different from your current password."
          );
        } else {
          setError("Could not update your password. Please try again.");
        }
        return;
      }

      setSuccess(true);

      // Sign out after successful password update
      setTimeout(async () => {
        await supabase.auth.signOut();
        router.push("/sign-in");
      }, 2000);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sessionError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card padding="lg" className="w-full max-w-md text-center">
          <span className="text-4xl" aria-hidden="true">
            🔗
          </span>
          <h1 className="mt-4 text-xl font-semibold text-text-primary">
            Invalid reset link
          </h1>
          <p className="mt-2 text-text-secondary">{sessionError}</p>
          <Link
            href="/reset-password"
            className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
          >
            Request a new reset link
          </Link>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card padding="lg" className="w-full max-w-md text-center">
          <span className="text-4xl" aria-hidden="true">
            ✅
          </span>
          <h1 className="mt-4 text-xl font-semibold text-text-primary">
            Password updated
          </h1>
          <p className="mt-2 text-text-secondary">
            Your password has been changed. You&apos;ll be redirected to sign
            in.
          </p>
        </Card>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card padding="lg" className="w-full max-w-md text-center">
          <p className="text-text-secondary">Verifying your reset link…</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card padding="lg" className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-text-primary">
            Set new password
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Choose a strong password for your account.
          </p>
        </div>

        {error && (
          <div className="mt-4">
            <ErrorMessage message={error} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="At least 8 characters"
            helpText="Must be at least 8 characters long."
            minLength={8}
          />
          <Input
            label="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="Re-enter your password"
          />
          <Button
            type="submit"
            loading={loading}
            loadingText="Updating password…"
            className="w-full"
          >
            Update password
          </Button>
        </form>
      </Card>
    </div>
  );
}
