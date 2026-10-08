import Link from "next/link";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Doctor workspace — Healthfolio" };

/**
 * Doctor home (role: doctor, granted only by facility/platform admins after
 * verification). Honest empty state: there is no fabricated queue here —
 * assigned cases appear once coordination assigns them.
 */
export default async function DoctorHomePage() {
  const guard = await requireArea("doctor");
  if (guard.kind === "redirect") redirect("/sign-in");
  if (guard.kind === "denied") return <AccessDenied homeHref="/doctor/application-status" />;

  return (
    <div className="mx-auto max-w-xl py-8">
      <Card padding="lg">
        <h1 className="text-xl font-semibold text-text-primary">Doctor workspace</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Your access is verified. Assigned care requests will appear here when
          your facility coordinator assigns them — nothing is simulated.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-text-secondary">
          <li>• You will only ever see patients assigned to you, or records explicitly shared with your active consent.</li>
          <li>• Record access is time-limited and revocable by the patient at any time.</li>
        </ul>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-11 items-center rounded-input border border-border bg-surface px-5 text-sm font-semibold text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Back to my health space
        </Link>
      </Card>
    </div>
  );
}
