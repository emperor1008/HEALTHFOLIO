"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas font-sans text-text-primary antialiased">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="text-center">
            <span className="text-5xl" aria-hidden="true">⚠️</span>
            <h1 className="mt-6 text-xl font-semibold text-text-primary">
              Something went wrong
            </h1>
            <p className="mt-3 max-w-md text-text-secondary">
              Healthfolio encountered an unexpected error. No data was changed.
              Please refresh the page or try again.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={reset}
                className="inline-flex h-11 items-center rounded-input bg-primary px-5 text-base font-semibold text-white hover:bg-primary-hover transition-colors duration-150"
              >
                Try again
              </button>
              <a
                href="/"
                className="inline-flex h-11 items-center rounded-input border border-border bg-surface px-5 text-base font-semibold text-text-primary hover:bg-canvas transition-colors duration-150"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
