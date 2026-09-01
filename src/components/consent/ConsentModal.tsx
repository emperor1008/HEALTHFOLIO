"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

const POLICY_VERSIONS = {
  terms: "1.0",
  privacy: "1.0",
  ai_processing: "1.0",
};

interface ConsentModalProps {
  isOpen: boolean;
  onAccepted: () => void;
  onDeclined: () => void;
}

/**
 * Consent modal shown before the first document upload.
 * Requires explicit acceptance of terms, privacy, and AI-processing consent.
 * Stores real versioned consent records server-side.
 */
export function ConsentModal({ isOpen, onAccepted, onDeclined }: ConsentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState({
    terms: false,
    privacy: false,
    aiProcessing: false,
  });

  const allAccepted = accepted.terms && accepted.privacy && accepted.aiProcessing;

  async function handleSubmit() {
    if (!allAccepted) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consents: [
            { consentType: "terms", policyVersion: POLICY_VERSIONS.terms },
            { consentType: "privacy", policyVersion: POLICY_VERSIONS.privacy },
            { consentType: "ai_processing", policyVersion: POLICY_VERSIONS.ai_processing },
          ],
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error?.message || "Could not save consent. Please try again.");
        return;
      }

      onAccepted();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleDecline() {
    onDeclined();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleDecline} title="Privacy and AI Processing" size="md">
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Before uploading medical documents, please review and accept the following terms.
        </p>

        {error && (
          <div className="rounded-card border border-error/20 bg-error/5 p-3 text-sm text-error">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <ConsentCheckbox
            label="Terms of Service"
            description="I accept the Healthfolio Terms of Service (v1.0)."
            checked={accepted.terms}
            onChange={(v) => setAccepted({ ...accepted, terms: v })}
          />
          <ConsentCheckbox
            label="Privacy Policy"
            description="I accept the Healthfolio Privacy Policy (v1.0)."
            checked={accepted.privacy}
            onChange={(v) => setAccepted({ ...accepted, privacy: v })}
          />
          <ConsentCheckbox
            label="AI Processing Consent"
            description="I understand that Healthfolio uses AI to process my uploaded medical documents for organizing records and preparing for consultations. AI processing occurs server-side and extracted information is stored securely."
            checked={accepted.aiProcessing}
            onChange={(v) => setAccepted({ ...accepted, aiProcessing: v })}
          />
        </div>

        <div className="rounded-card bg-canvas p-3 text-xs text-text-secondary">
          <p className="font-medium text-text-primary">Important:</p>
          <ul className="mt-1 space-y-0.5">
            <li>• Documents are processed securely on the server</li>
            <li>• AI extracts factual information; it does not diagnose or recommend treatment</li>
            <li>• You can delete your data at any time from Settings</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={handleSubmit}
            loading={loading}
            loadingText="Saving…"
            disabled={!allAccepted}
            className="flex-1"
          >
            Accept and upload
          </Button>
          <Button
            variant="secondary"
            onClick={handleDecline}
            disabled={loading}
          >
            Decline
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ConsentCheckbox({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-card border border-border p-3 cursor-pointer hover:bg-canvas transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 rounded border-border text-primary focus:ring-primary"
      />
      <div>
        <div className="font-medium text-text-primary text-sm">{label}</div>
        <div className="mt-0.5 text-xs text-text-secondary">{description}</div>
      </div>
    </label>
  );
}
