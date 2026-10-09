import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Facility administration — Healthfolio" };

/** Facility admin home (role granted only by a platform admin). */
export default async function FacilityAdminPage() {
  const guard = await requireArea("facility_admin");
  if (guard.kind === "redirect") redirect("/sign-in");
  if (guard.kind === "denied") return <AccessDenied />;

  return (
    <div className="mx-auto max-w-xl py-8">
      <Card padding="lg">
        <h1 className="text-xl font-semibold text-text-primary">
          Facility administration
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          You manage only the facilities assigned to you. Doctor applications
          from your facility appear here for verification — none are simulated.
        </p>
        <p className="mt-4 rounded-xl bg-canvas p-3 text-xs text-text-secondary">
          Role changes you make are audited with redacted metadata only.
        </p>
      </Card>
    </div>
  );
}
