"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input } from "@/components/ui/Input";

interface Extraction {
  id: string;
  document_id: string;
  page_number: number;
  field_type: string;
  raw_value: string;
  normalized_value: Record<string, unknown>;
  confidence: number;
  verification_status: string;
  evidence_locator: {
    documentId: string;
    documentName: string;
    pageNumber: number;
    sourceText?: string;
  } | null;
  created_at: string;
}

interface Document {
  id: string;
  original_name: string;
  status: string;
}

const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: "Looks clear", color: "text-success" },
  medium: { label: "Please review", color: "text-warning" },
  low: { label: "Could not read", color: "text-error" },
};

function getConfidenceLabel(confidence: number) {
  if (confidence >= 0.85) return CONFIDENCE_LABELS.high;
  if (confidence >= 0.6) return CONFIDENCE_LABELS.medium;
  return CONFIDENCE_LABELS.low;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  date: "Date",
  instruction: "Instruction",
  test: "Test result",
  clinician: "Clinician",
  event: "Event",
  prescription: "Prescription",
  diagnosis_text: "Report finding",
  follow_up: "Follow-up",
  other: "Other",
};

export default function ReviewPage() {
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correcting, setCorrecting] = useState(false);
  const [correctedValue, setCorrectedValue] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load pending extractions
    const { data: exts } = await supabase
      .from("extractions")
      .select("*")
      .eq("user_id", user.id)
      .in("verification_status", ["pending", "pending_review"])
      .order("confidence", { ascending: true });

    setExtractions(exts || []);

    // Load documents
    const { data: docs } = await supabase
      .from("documents")
      .select("id, original_name, status")
      .eq("user_id", user.id);

    setDocuments(docs || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentExtraction = extractions[currentIndex];
  const currentDocument = currentExtraction
    ? documents.find((d) => d.id === currentExtraction.document_id)
    : null;

  async function handleDecision(decision: "confirm" | "correct" | "reject") {
    if (!currentExtraction) return;
    setProcessing(true);
    setError(null);

    try {
      const supabase = await createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `/api/extractions/${currentExtraction.id}/confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            decision,
            correctedValue: decision === "correct" ? correctedValue : null,
          }),
        }
      );

      const result = await response.json();

      if (result.error) {
        setError(result.error.message);
        return;
      }

      // Move to next
      setExtractions((prev) => prev.filter((e) => e.id !== currentExtraction.id));
      setCurrentIndex(0);
      setCorrecting(false);
      setCorrectedValue("");
      setSuccess(
        decision === "confirm"
          ? "Information confirmed."
          : decision === "correct"
          ? "Information corrected."
          : "Information rejected."
      );
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Could not update extraction. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (extractions.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
            Review extracted information
          </h1>
          <p className="mt-1 text-text-secondary">
            Confirm, correct, or reject information found in your documents.
          </p>
        </div>
        <EmptyState
          icon="✓"
          title="Nothing to review"
          description="All extracted information has been reviewed. Your verified timeline is up to date."
          action={{
            label: "View timeline",
            onClick: () => (window.location.href = "/timeline"),
          }}
        />
      </div>
    );
  }

  const confidence = getConfidenceLabel(currentExtraction.confidence);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
          Review extracted information
        </h1>
        <p className="mt-1 text-text-secondary">
          {extractions.length} item{extractions.length !== 1 ? "s" : ""} need
          your review.
        </p>
      </div>

      {error && <ErrorMessage message={error} />}
      {success && (
        <div className="rounded-card border border-success/20 bg-success/5 p-4 text-sm text-success">
          {success}
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 rounded-full bg-border">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{
              width: `${((extractions.length - currentIndex) / extractions.length) * 100}%`,
            }}
          />
        </div>
        <span className="text-sm text-text-secondary">
          {currentIndex + 1} of {extractions.length}
        </span>
      </div>

      {/* Extraction card */}
      <Card padding="lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-secondary">
                {FIELD_TYPE_LABELS[currentExtraction.field_type] || "Information"}
              </span>
              <span className={`text-sm font-medium ${confidence.color}`}>
                {confidence.label}
              </span>
            </div>
          </div>
          <Badge
            variant={
              currentExtraction.confidence >= 0.85
                ? "verified"
                : currentExtraction.confidence >= 0.6
                ? "review"
                : "failed"
            }
          >
            {Math.round(currentExtraction.confidence * 100)}% confident
          </Badge>
        </div>

        {/* Extracted value */}
        <div className="mt-4 rounded-card bg-canvas p-4">
          <p className="text-xs font-medium uppercase text-text-secondary">
            Extracted information
          </p>
          <p className="mt-1 text-lg font-medium text-text-primary">
            {currentExtraction.raw_value}
          </p>
        </div>

        {/* Source */}
        <div className="mt-4 text-sm text-text-secondary">
          <p>
            Source:{" "}
            <span className="font-medium text-text-primary">
              {currentDocument?.original_name || currentExtraction.evidence_locator?.documentName || "Unknown"}
            </span>
            , page {currentExtraction.evidence_locator?.pageNumber || currentExtraction.page_number}
          </p>
          {currentExtraction.evidence_locator?.sourceText && (
            <p className="mt-2 rounded bg-canvas p-3 text-xs italic text-text-secondary">
              &ldquo;{currentExtraction.evidence_locator.sourceText}&rdquo;
            </p>
          )}
        </div>

        {/* Correct form */}
        {correcting && (
          <div className="mt-4">
            <Input
              label="Corrected value"
              value={correctedValue}
              onChange={(e) => setCorrectedValue(e.target.value)}
              placeholder="Enter the correct information"
            />
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          {!correcting ? (
            <>
              <Button
                onClick={() => handleDecision("confirm")}
                loading={processing}
                loadingText="Confirming..."
              >
                Confirm
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setCorrecting(true);
                  setCorrectedValue(currentExtraction.raw_value);
                }}
              >
                Correct
              </Button>
              <Button
                variant="ghost"
                onClick={() => handleDecision("reject")}
                loading={processing}
                loadingText="Rejecting..."
              >
                Reject
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => handleDecision("correct")}
                loading={processing}
                loadingText="Saving..."
                disabled={!correctedValue.trim()}
              >
                Save correction
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setCorrecting(false);
                  setCorrectedValue("");
                }}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="ghost"
          onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
        >
          Previous
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            setCurrentIndex(Math.min(extractions.length - 1, currentIndex + 1))
          }
          disabled={currentIndex >= extractions.length - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
