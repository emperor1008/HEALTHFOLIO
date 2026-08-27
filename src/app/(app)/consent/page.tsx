"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

const POLICY_VERSIONS = {
  terms: "1.0",
  privacy: "1.0",
  ai_processing: "1.0",
};

export default function ConsentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState({
    terms: false,
    privacy: false,
    aiProcessing: false,
  });

  const allAccepted = accepted.terms && accepted.privacy && accepted.aiProcessing;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allAccepted) return;

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Your session has expired. Please sign in again.");
        return;
      }

      const response = await fetch("/api/consent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          consents: [
            { consentType: "terms", policyVersion: POLICY_VERSIONS.terms },
            { consentType: "privacy", policyVersion: POLICY_VERSIONS.privacy },
            {
              consentType: "ai_processing",
              policyVersion: POLICY_VERSIONS.ai_processing,
            },
          ],
        }),
      });

      if (!response.ok) {
        setError("Could not save your consent. Please try again.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card padding="lg" className="w-full max-w-lg">
        <div className="text-center">
          <span className="text-3xl" aria-hidden="true">🔒</span>
          <h1 className="mt-4 text-xl font-semibold text-text-primary">
            Privacy and AI Processing
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Before using Healthfolio, please review and accept the following
            terms.
          </p>
        </div>

        {error && (
          <div className="mt-4">
            <ErrorMessage message={error} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
            description="I understand that Healthfolio uses artificial intelligence to process my uploaded medical documents for the purpose of organizing records and preparing for consultations. AI processing occurs server-side and extracted information is stored securely in my account."
            checked={accepted.aiProcessing}
            onChange={(v) => setAccepted({ ...accepted, aiProcessing: v })}
          />

          <div className="rounded-card bg-canvas p-4 text-sm text-text-secondary">
            <p className="font-medium text-text-primary">Important notes:</p>
            <ul className="mt-2 space-y-1">
              <li>• Your documents are processed securely on the server</li>
              <li>• AI extracts factual information; it does not diagnose or recommend treatment</li>
              <li>• You can delete your data at any time from Settings</li>
              <li>• Healthfolio does not share your data with third parties</li>
            </ul>
          </div>

          <Button
            type="submit"
            loading={loading}
            loadingText="Saving consent…"
            disabled={!allAccepted}
            className="w-full"
          >
            Accept and continue
          </Button>
        </form>
      </Card>
    </div>
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
    <label className="flex items-start gap-3 rounded-card border border-border p-4 cursor-pointer hover:bg-canvas transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 rounded border-border text-primary focus:ring-primary"
      />
      <div>
        <div className="font-medium text-text-primary">{label}</div>
        <div className="mt-0.5 text-sm text-text-secondary">{description}</div>
      </div>
    </label>
  );
}
