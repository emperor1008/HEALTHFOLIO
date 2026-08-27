import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <span className="text-5xl" aria-hidden="true">🔍</span>
        <h1 className="mt-6 text-xl font-semibold text-text-primary">
          Page not found
        </h1>
        <p className="mt-3 max-w-md text-text-secondary">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center rounded-input bg-primary px-5 text-base font-semibold text-white hover:bg-primary-hover transition-colors duration-150"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
