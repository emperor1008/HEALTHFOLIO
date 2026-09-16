"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ensureAnonymousSession } from "@/lib/supabase/session";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Silent anonymous authentication bootstrap.
 *
 * Creates (or reuses) the anonymous session that isolates each visitor's
 * private data, then continues to the original destination. Retries
 * transient failures automatically before showing a calm recovery state.
 * No technical details are ever surfaced.
 */

const MAX_AUTO_RETRIES = 2;
const RETRY_DELAY_MS = 1200;

function BootstrapInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read the redirect target once; validated to an internal path.
  const rawRedirect = searchParams.get("redirect") || "/dashboard";
  const redirect = rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
    ? rawRedirect
    : "/dashboard";

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const user = await ensureAnonymousSession();

      if (cancelled) return;

      if (user) {
        router.replace(redirect);
      } else if (attempt < MAX_AUTO_RETRIES) {
        // Transient failure — retry quietly after a short delay
        retryTimerRef.current = setTimeout(() => {
          if (!cancelled) {
            setAttempt((a) => a + 1);
          }
        }, RETRY_DELAY_MS);
      } else {
        setFailed(true);
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [attempt, router, redirect]);

  const handleRetry = useCallback(() => {
    setFailed(false);
    setRetrying(true);
    setAttempt(0);
    // attempt reset triggers the effect; give the state a tick to settle
    setTimeout(() => setRetrying(false), 50);
  }, []);

  if (failed) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card padding="lg" className="w-full max-w-md text-center">
          <span className="text-4xl" aria-hidden="true">
            🔒
          </span>
          <h1 className="mt-4 text-xl font-semibold text-text-primary">
            We couldn&apos;t open your health space yet
          </h1>
          <p className="mt-2 text-text-secondary">
            This is usually a connection issue. Your information is safe — please
            try again.
          </p>
          <button
            onClick={handleRetry}
            className="mt-5 min-h-touch rounded-card bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            Try again
          </button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card padding="lg" className="w-full max-w-md text-center">
        <Spinner size="lg" />
        <p className="mt-4 text-text-secondary" aria-live="polite">
          {retrying ? "Trying again…" : "Preparing your private health space…"}
        </p>
      </Card>
    </div>
  );
}

export default function BootstrapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center px-4">
          <Card padding="lg" className="w-full max-w-md text-center">
            <Spinner size="lg" />
            <p className="mt-4 text-text-secondary">Preparing your private health space…</p>
          </Card>
        </div>
      }
    >
      <BootstrapInner />
    </Suspense>
  );
}
