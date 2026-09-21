"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { useLanguage } from "@/lib/i18n/language-context";
import { LANGUAGES, LANGUAGE_LABELS } from "@/lib/i18n";
import type { Language } from "@/lib/i18n";

export default function SettingsPage() {
  const { language, setLanguage, t } = useLanguage();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const supabase = await createClient();
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
    if (deleteConfirmation !== "DELETE") return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });

      const result = await response.json();

      if (result.error) {
        setDeleteError(result.error.message);
        return;
      }

      setSuccess("Account deleted. Redirecting to sign in...");
      setTimeout(() => {
        window.location.href = "/sign-in";
      }, 2000);
    } catch {
      setDeleteError("Could not delete account. Please try again.");
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

      {/* Language */}
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-text-primary">
          {t("languageSettings")}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {t("languageSettingsHint")}
        </p>
        <div
          role="radiogroup"
          aria-label={t("languageSettings")}
          className="mt-4 flex flex-wrap gap-2"
        >
          {LANGUAGES.map((lang: Language) => (
            <button
              key={lang}
              type="button"
              role="radio"
              aria-checked={language === lang}
              onClick={() => setLanguage(lang)}
              className={`min-h-[44px] rounded-full border px-5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                language === lang
                  ? "border-primary bg-primary text-white"
                  : "border-border bg-surface text-text-primary hover:bg-primary/5"
              }`}
            >
              {LANGUAGE_LABELS[lang]}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-text-secondary">
          {t("languageSyncNote")}
        </p>
      </Card>

      {/* Anonymous user notice */}
      <Card padding="md" className="border-warning/20 bg-warning/5">
        <p className="text-sm text-text-secondary">
          Your information is currently connected to this browser. Clearing browser data may remove access to your records. Account linking will be available later.
        </p>
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
            Permanently delete your account and all associated data including documents,
            extractions, timeline events, briefs, and reminders. This action cannot be undone.
          </p>
          {deleteError && (
            <p className="mt-2 text-sm text-error">{deleteError}</p>
          )}
          <div className="mt-4 flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-text-primary">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="DELETE"
                className="mt-1 block w-full rounded-card border border-border px-3 py-2 text-sm"
              />
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRequestDeletion}
              loading={deleting}
              loadingText="Deleting…"
              disabled={deleteConfirmation !== "DELETE"}
            >
              Delete account
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
