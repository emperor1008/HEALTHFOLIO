import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth/page-guard";
import { getServerSupabase } from "@/lib/supabase/user-context";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Application status — Healthfolio" };

const STATUS_COPY: Record<string, { label: string; detail: string }> = {
  received: {
    label: "Application received",
    detail:
      "Your application is in the queue. A facility administrator reviews applications in order.",
  },
  under_review: {
    label: "Under review",
    detail:
      "An administrator is verifying your details. This usually takes a few working days.",
  },
  approved: {
    label: "Approved",
    detail: "Your application has been approved. Sign in again to reach your doctor workspace.",
  },
  declined: {
    label: "Declined",
    detail:
      "Your application was not approved. Contact the facility administration for details.",
  },
};

export default async function DoctorApplicationStatusPage() {
  const guard = await requireArea("doctor_pending_or_doctor");
  if (guard.kind === "redirect") redirect("/sign-in");
  if (guard.kind === "denied") return <AccessDenied />;

  let status: string | null = null;
  try {
    const supabase = getServerSupabase();
    const { data } = await supabase
      .from("doctor_applications")
      .select("status")
      .eq("user_id", guard.userId)
      .maybeSingle();
    status = data?.status ?? "received";
  } catch {
    status = null;
  }

  const copy = STATUS_COPY[status ?? ""] ?? STATUS_COPY.received;

  return (
    <div className="mx-auto max-w-xl py-8">
      <Card padding="lg">
        <h1 className="text-xl font-semibold text-text-primary">Doctor application</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Status:{" "}
          <strong className="text-text-primary" aria-live="polite">
            {copy.label}
          </strong>
        </p>
        <p className="mt-3 text-sm text-text-secondary">{copy.detail}</p>
        <p className="mt-4 rounded-xl bg-canvas p-3 text-xs text-text-secondary">
          You are not shown to patients as a verified doctor until an authorized
          administrator approves your application.
        </p>
      </Card>
    </div>
  );
}
