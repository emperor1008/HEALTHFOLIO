/** Offline fallback page — served from the service-worker shell cache. */
import Link from "next/link";

export const metadata = {
  title: "Offline · Healthfolio",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#FAF7F2] px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1E4D45]/10 text-3xl" aria-hidden="true">
        📶
      </div>
      <h1 className="text-2xl font-semibold text-[#1E4D45]">You are offline</h1>
      <p className="max-w-sm text-[#3F4A46]">
        You can still open the app — anything you save while offline is kept safely on this
        device and delivered automatically once a connection returns.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex min-h-[44px] items-center rounded-full bg-[#1E4D45] px-6 text-white transition hover:bg-[#173B35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E4D45]"
      >
        Try the home screen
        <span aria-hidden="true" className="ml-2">
          →
        </span>
      </Link>
    </main>
  );
}
