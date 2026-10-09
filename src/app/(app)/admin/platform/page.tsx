import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { Card } from "@/components/ui/Card";
import { PlatformAdminSummary } from "@/components/auth/PlatformAdminSummary";

export const metadata = { title: "Platform administration — Healthfolio" };

/**
 * Platform-admin home. This role can never be created through sign-up, URL
 * parameters, or request bodies — only the local bootstrap script or an
 * existing platform admin. Every action in this area writes a redacted
 * role_policy_events row.
 */
export default async function PlatformAdminPage() {
  const guard = await requireArea("platform_admin");
  if (guard.kind === "redirect") redirect("/sign-in");
  if (guard.kind === "denied") return <AccessDenied />;

  return (
    <div className="mx-auto max-w-xl py-8">
      <Card padding="lg">
        <h1 className="text-xl font-semibold text-text-primary">
          Platform administration
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Platform-only actions: assign facility admins and verified doctors,
          review doctor applications, and audit role changes.
        </p>
      </Card>
      <PlatformAdminSummary />
    </div>
  );
}
