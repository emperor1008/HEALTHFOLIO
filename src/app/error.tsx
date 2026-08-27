"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error non-sensitive details
    console.error("Route error:", error.message);
  }, [error]);

  return (
    <div className="flex min-h-[400px] items-center justify-center px-4">
      <div className="text-center">
        <span className="text-4xl" aria-hidden="true">⚠️</span>
        <h2 className="mt-4 text-lg font-semibold text-text-primary">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          No data was changed. Please try again.
        </p>
        <Button onClick={reset} className="mt-6">
          Try again
        </Button>
      </div>
    </div>
  );
}
