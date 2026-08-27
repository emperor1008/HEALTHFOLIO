import Link from "next/link";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-4 md:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold text-primary"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <rect width="24" height="24" rx="6" fill="#0F5C5E" />
              <path
                d="M7 8h10M7 12h6M7 16h8"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>Healthfolio</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex h-9 items-center rounded-input bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover transition-colors"
            >
              Create my Healthfolio
            </Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-8">
          <div className="flex flex-col items-center gap-4 text-center text-sm text-text-secondary md:flex-row md:justify-between md:text-left">
            <div>
              <span className="font-semibold text-primary">Healthfolio</span>
              <span className="ml-2">Your health history, clearly organized.</span>
            </div>
            <div className="flex gap-4">
              <span>
                Healthfolio organizes medical information and helps you prepare
                for consultations. It does not diagnose conditions, recommend
                treatment, or replace a healthcare professional.
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
