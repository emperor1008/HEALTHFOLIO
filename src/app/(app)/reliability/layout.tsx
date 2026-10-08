import { requireArea } from "@/lib/auth/page-guard";
import { AccessDenied } from "@/components/auth/AccessDenied";

/**
 * Server-side guard for this staff-only area: per-request Better Auth session
 * + role registry resolution. Client components beneath never receive denied
 * content.
 */
export default async function AreaGuardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const guard = await requireArea("facility_or_platform_admin");
  if (guard.kind === "denied") return <AccessDenied />;
  if (guard.kind === "redirect") return <AccessDenied homeHref="/sign-in" />;
  return <>{children}</>;
}
