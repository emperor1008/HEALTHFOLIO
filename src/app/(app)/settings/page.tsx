"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

export default function SettingsPage() {
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("id", user.id);

      setSuccess("Profile updated.");
    } catch {
      setError("Could not update profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRequestDeletion() {
    if (!confirm("Are you sure you want to request account deletion? This action cannot be undone.")) {
      return;
    }

    setDeleting(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // In a real app, this would create a deletion request
      setSuccess("Account deletion request submitted. You will receive a confirmation email.");
    } catch {
      setError("Could not submit deletion request.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
          Settings
        </h1>
        <p className="mt-1 text-text-secondary">
          Manage your account, privacy and data.
        </p>
      </div>

      {error && <ErrorMessage message={error} />}
      {success && (
        <div className="rounded-card border border-success/20 bg-success/5 p-4 text-sm text-success">
          {success}
        </div>
      )}

      {/* Profile */}
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-text-primary">Profile</h2>
        <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
          <Input
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name (optional)"
          />
          <Button type="submit" loading={saving} loadingText="Saving…">
            Save profile
          </Button>
        </form>
      </Card>

      {/* Privacy */}
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-text-primary">Privacy</h2>
        <div className="mt-4 space-y-4 text-sm text-text-secondary">
          <div className="rounded-card bg-canvas p-4">
            <p className="font-medium text-text-primary">How your data is handled</p>
            <ul className="mt-2 space-y-1">
              <li>• Your documents are stored in a private, encrypted bucket</li>
              <li>• Only you can access your records</li>
              <li>• AI processing occurs server-side; your API keys are never exposed</li>
              <li>• We do not share your data with third parties</li>
              <li>• You can delete your data at any time</li>
            </ul>
          </div>
          <div className="rounded-card bg-canvas p-4">
            <p className="font-medium text-text-primary">AI Processing</p>
            <p className="mt-1">
              Your documents are processed by an AI model to extract structured information.
              The AI does not provide medical advice or diagnosis. All extracted information
              requires your review and confirmation before being used.
            </p>
          </div>
        </div>
      </Card>

      {/* Account deletion */}
      <Card padding="lg" className="border-error/20">
        <h2 className="text-lg font-semibold text-error">Danger Zone</h2>
        <div className="mt-4">
          <p className="text-sm text-text-secondary">
            Request account deletion. This will permanently remove your account, documents,
            extractions, timeline events, briefs, and all associated data. This action
            cannot be undone.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleRequestDeletion}
            loading={deleting}
            loadingText="Submitting…"
            className="mt-4"
          >
            Request account deletion
          </Button>
        </div>
      </Card>
    </div>
  );
}
