import Link from "next/link";

/**
 * Accessible access-denied screen. No raw errors, no technical codes — a calm
 * explanation plus the user's legitimate home areas. Meets contrast and
 * focus-visible requirements of the design system.
 */
export function AccessDenied({ homeHref = "/dashboard" }: { homeHref?: string }) {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center px-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/10 text-xl"
        >
          🔒
        </div>
        <h1 className="text-lg font-semibold text-text-primary">
          You do not have access to this area
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          This section is limited to specific verified roles. If you believe
          you should have access, contact your facility administrator.
        </p>
        <Link
          href={homeHref}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-input bg-primary px-6 text-sm font-semibold text-white hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Go to my home page
        </Link>
      </div>
    </div>
  );
}
