"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureAnonymousSession } from "@/lib/supabase/session";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Silent anonymous authentication bootstrap.
 * Uses centralized session helper to prevent duplicate calls.
 */
export default function BootstrapPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Setting up your secure session…");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const user = await ensureAnonymousSession();

      if (cancelled) return;

      if (user) {
        router.replace("/dashboard");
      } else {
        setError(
          "Healthfolio could not create a secure session. Please refresh and try again."
        );
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card padding="lg" className="w-full max-w-md text-center">
          <span className="text-4xl" aria-hidden="true">
            🔒
          </span>
          <h1 className="mt-4 text-xl font-semibold text-text-primary">
            Session setup failed
          </h1>
          <p className="mt-2 text-text-secondary">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-card bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
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
        <p className="mt-4 text-text-secondary">{status}</p>
      </Card>
    </div>
  );
}
