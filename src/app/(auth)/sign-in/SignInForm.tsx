"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

/**
 * Only same-origin, non-protocol-relative paths are honored for post-login
 * redirects. Everything else falls back to the default role router.
 * Implementation lives in `@/lib/auth/redirect` (shared + unit-tested).
 */

import { sanitizeRedirect } from "@/lib/auth/redirect";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let result: Awaited<ReturnType<typeof signIn.email>>;
    try {
      result = await signIn.email({
        email: email.trim(),
        password,
        callbackURL: sanitizeRedirect(searchParams.get("redirect")) ?? undefined,
      });
    } catch {
      // Network-level failure (server unreachable) — never a credential problem.
      setError("We couldn't reach Healthfolio right now. Please check your connection and try again.");
      setLoading(false);
      return;
    }

    if (result.error) {
      const status = result.error.status;
      if (typeof status === "number" && status >= 500) {
        // Server/infrastructure failure — the credentials were never checked.
        // Do not blame them: that would send the user retrying forever.
        setError("Something went wrong on our side. Please try again in a few minutes.");
      } else {
        // Generic, calm message for credential failures — never reveals
        // whether the email exists, and never surfaces raw provider errors.
        setError("Email or password is incorrect, or too many attempts were made. Please try again.");
      }
      setLoading(false);
      return;
    }

    // Role-based routing is decided by the server via callbackURL resolution;
    // for non-callback sign-ins the client asks the server where to go.
    try {
      const res = await fetch("/api/auth/home", { method: "GET" });
      if (res.ok) {
        const data = (await res.json()) as { home?: string };
        router.push(sanitizeRedirect(searchParams.get("redirect")) ?? data.home ?? "/dashboard");
        router.refresh();
        return;
      }
    } catch {
      // fall through to default
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card padding="lg" className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-text-primary">
            Sign in to Healthfolio
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Access your medical records and consultation preparation.
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
            autoComplete="current-password"
            placeholder="Enter your password"
          />
          <Button
            type="submit"
            loading={loading}
            loadingText="Signing in…"
            className="w-full"
          >
            Sign in
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Link
            href="/forgot-password"
            className="text-sm text-primary hover:underline"
          >
            Forgot your password?
          </Link>
        </div>

        <p className="mt-4 text-center text-sm text-text-secondary">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-primary hover:underline"
          >
            Create my Healthfolio
          </Link>
        </p>
      </Card>
    </div>
  );
}
