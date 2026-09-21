"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import type { BriefContent } from "@/lib/ai/schemas";

interface Brief {
  id: string;
  content: BriefContent;
  status: string;
  version: number;
  created_at: string;
  appointment_id: string | null;
}

export default function PreparationPage() {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingIcs, setExportingIcs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadBriefs() {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("briefs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setBriefs(data || []);
      setLoading(false);
    }

    loadBriefs();
  }, []);

  async function handleGenerateBrief() {
    setGenerating(true);
    setError(null);

    try {
      const supabase = await createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch("/api/briefs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          portfolioId: (await supabase.from("portfolios").select("id").limit(1)).data?.[0]?.id,
        }),
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error.message);
        return;
      }

      setBriefs((prev) => [
        {
          id: result.data.briefId,
          content: result.data.content,
          status: "draft",
          version: 1,
          created_at: new Date().toISOString(),
          appointment_id: null,
        },
        ...prev,
      ]);

      setSuccess("Brief generated. Please review and approve it.");
    } catch {
      setError("Could not generate brief. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleApproveBrief(briefId: string) {
    const supabase = await createClient();
    await supabase
      .from("briefs")
      .update({ status: "approved" })
      .eq("id", briefId);

    setBriefs((prev) =>
      prev.map((b) => (b.id === briefId ? { ...b, status: "approved" } : b))
    );

    setSuccess("Brief approved. You can now export it as PDF.");
  }

  async function handleExportPdf(brief: Brief) {
    setExportingPdf(true);
    try {
      const response = await fetch(`/api/briefs/${brief.id}/pdf`);
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `healthfolio-brief-${brief.id.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess("PDF exported successfully.");
    } catch {
      setError("PDF export failed. Please try again.");
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleExportIcs(appointmentId: string) {
    setExportingIcs(true);
    try {
      const response = await fetch(`/api/calendar/${appointmentId}/ics`);
      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "healthfolio-appointment.ics";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess("Calendar file downloaded. Import it into your calendar app.");
    } catch {
      setError("Calendar export failed. Please try again.");
    } finally {
      setExportingIcs(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  const latestBrief = briefs[0];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
            Consultation Preparation
          </h1>
          <p className="mt-1 text-text-secondary">
            Your brief, checklist and export controls.
          </p>
        </div>
        <Button onClick={handleGenerateBrief} loading={generating} loadingText="Generating…">
          Generate brief
        </Button>
      </div>

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}
      {success && (
        <div className="rounded-card border border-success/20 bg-success/5 p-4 text-sm text-success">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {latestBrief ? (
        <BriefView
          brief={latestBrief}
          onApprove={handleApproveBrief}
          onExportPdf={handleExportPdf}
          onExportIcs={handleExportIcs}
          exportingPdf={exportingPdf}
          exportingIcs={exportingIcs}
        />
      ) : (
        <EmptyState
          icon="📋"
          title="No consultation brief yet"
          description="Generate a brief from your verified medical records and preparation goal."
          action={{
            label: "Generate brief",
            onClick: handleGenerateBrief,
            loading: generating,
          }}
        />
      )}

      {/* Previous briefs */}
      {briefs.length > 1 && (
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Previous versions</h2>
          <div className="mt-4 space-y-3">
            {briefs.slice(1).map((brief) => (
              <Card key={brief.id} padding="md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      Version {brief.version}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {new Date(brief.created_at).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <Badge variant={brief.status === "approved" ? "verified" : "excluded"}>
                    {brief.status}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BriefView({
  brief,
  onApprove,
  onExportPdf,
  onExportIcs,
  exportingPdf,
  exportingIcs,
}: {
  brief: Brief;
  onApprove: (id: string) => void;
  onExportPdf: (brief: Brief) => void;
  onExportIcs: (appointmentId: string) => void;
  exportingPdf: boolean;
  exportingIcs: boolean;
}) {
  const content = brief.content;

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Consultation Brief</h2>
            <p className="text-sm text-text-secondary">
              Generated {new Date(brief.created_at).toLocaleDateString("en-IN")}
            </p>
          </div>
          <Badge variant={brief.status === "approved" ? "verified" : "review"}>
            {brief.status === "approved" ? "Approved" : "Draft — needs review"}
          </Badge>
        </div>

        {/* Appointment details */}
        {content.appointmentDetails && (
          <div className="mt-6 rounded-card bg-canvas p-4">
            <h3 className="text-sm font-semibold text-text-primary">Appointment</h3>
            <div className="mt-2 grid gap-2 text-sm text-text-secondary sm:grid-cols-2">
              {content.appointmentDetails.date && (
                <p>Date: {content.appointmentDetails.date}</p>
              )}
              {content.appointmentDetails.time && (
                <p>Time: {content.appointmentDetails.time} ({content.appointmentDetails.timezone})</p>
              )}
              {content.appointmentDetails.specialty && (
                <p>Specialty: {content.appointmentDetails.specialty}</p>
              )}
              {content.appointmentDetails.clinicianName && (
                <p>Clinician: {content.appointmentDetails.clinicianName}</p>
              )}
              {content.appointmentDetails.location && (
                <p>Location: {content.appointmentDetails.location}</p>
              )}
            </div>
          </div>
        )}

        {/* Goal */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-text-primary">Preparation Goal</h3>
          <p className="mt-1 text-text-secondary">{content.goal}</p>
        </div>

        {/* Verified Events */}
        {content.verifiedEvents.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-text-primary">Verified Timeline</h3>
            <div className="mt-2 space-y-2">
              {content.verifiedEvents.map((event, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-success" aria-label="Verified">✓</span>
                  <div>
                    <p className="font-medium text-text-primary">
                      {event.date || "Unknown date"} — {event.title}
                    </p>
                    <p className="text-text-secondary">{event.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Questions */}
        {content.questionsToDiscuss.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-text-primary">Questions to Discuss</h3>
            <ul className="mt-2 space-y-1 text-sm text-text-secondary">
              {content.questionsToDiscuss.map((q, i) => (
                <li key={i}>• {q}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Checklist */}
        {content.preparationChecklist.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-text-primary">Preparation Checklist</h3>
            <ul className="mt-2 space-y-1 text-sm text-text-secondary">
              {content.preparationChecklist.map((item, i) => (
                <li key={i}>☐ {item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Documents */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-text-primary">Documents</h3>
          <div className="mt-2 text-sm text-text-secondary">
            {content.documentsIncluded.length > 0 && (
              <div>
                <p className="font-medium">Included:</p>
                <ul className="mt-1 space-y-0.5">
                  {content.documentsIncluded.map((doc, i) => (
                    <li key={i}>• {doc.name} ({doc.type.replace("_", " ")})</li>
                  ))}
                </ul>
              </div>
            )}
            {content.documentsMissing.length > 0 && (
              <div className="mt-2">
                <p className="font-medium text-warning">Missing/Failed:</p>
                <ul className="mt-1 space-y-0.5">
                  {content.documentsMissing.map((name, i) => (
                    <li key={i}>• {name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Safety disclaimer */}
        <div className="mt-6 rounded-card border border-border p-4 text-xs text-text-secondary">
          {content.safetyDisclaimer}
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {brief.status !== "approved" && (
          <Button onClick={() => onApprove(brief.id)}>
            Approve brief
          </Button>
        )}
        {brief.status === "approved" && (
          <>
            <Button
              onClick={() => onExportPdf(brief)}
              loading={exportingPdf}
              loadingText="Exporting…"
            >
              Export PDF
            </Button>
            {brief.appointment_id && (
              <Button
                variant="secondary"
                onClick={() => onExportIcs(brief.appointment_id!)}
                loading={exportingIcs}
                loadingText="Downloading…"
              >
                Download calendar
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
