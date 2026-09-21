"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Spinner } from "@/components/ui/Spinner";
import { ConsentModal } from "@/components/consent/ConsentModal";

const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg"];

interface UploadedFile {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  progress: number;
  status: "uploading" | "ready" | "error";
  error?: string;
}

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Berlin", label: "Central Europe (CET)" },
  { value: "Asia/Tokyo", label: "Japan (JST)" },
  { value: "Australia/Sydney", label: "Australia (AEST)" },
  { value: "UTC", label: "UTC" },
];

export default function PreparePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [goal, setGoal] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [specialty, setSpecialty] = useState("");
  const [clinicianName, setClinicianName] = useState("");
  const [location, setLocation] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  const hasFiles = files.some((f) => f.status === "ready");
  const hasGoal = goal.trim().length > 0;
  const canStart = hasGoal && hasFiles && !starting;

  const validateFile = useCallback((file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return "Upload a PDF, PNG, or JPEG file.";
    }
    if (!ALLOWED_TYPES.includes(file.type) && file.type !== "") {
      return "Upload a PDF, PNG, or JPEG file.";
    }
    if (file.size > MAX_SIZE) {
      return "This file exceeds the 10 MB limit.";
    }
    return null;
  }, []);

  const handleFileSelect = useCallback(
    async (selectedFiles: FileList | null) => {
      if (!selectedFiles || selectedFiles.length === 0) return;
      setError(null);

      // Check consent before uploading
      if (!consentChecked) {
        try {
          const statusRes = await fetch("/api/consent/status");
          const statusData = await statusRes.json();
          if (!statusData.data?.hasConsent) {
            setPendingFiles(selectedFiles);
            setShowConsent(true);
            return;
          }
          setConsentChecked(true);
        } catch {
          // If consent check fails, show modal to be safe
          setPendingFiles(selectedFiles);
          setShowConsent(true);
          return;
        }
      }

      await processFiles(selectedFiles);
    }, [consentChecked]
  );

  const processFiles = useCallback(
    async (selectedFiles: FileList) => {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get or create portfolio
      let portfolioId: string | null = null;
      const { data: portfolios } = await supabase
        .from("portfolios")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (portfolios && portfolios.length > 0) {
        portfolioId = portfolios[0].id;
      } else {
        const { data: newPortfolio } = await supabase
          .from("portfolios")
          .insert({ user_id: user.id, label: "My Healthfolio" })
          .select("id")
          .single();
        portfolioId = newPortfolio?.id || null;
      }

      if (!portfolioId) {
        setError("Could not set up your portfolio.");
        return;
      }

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const validationError = validateFile(file);
        const fileEntry: UploadedFile = {
          id: crypto.randomUUID(),
          fileName: file.name,
          sizeBytes: file.size,
          mimeType: file.type || "application/octet-stream",
          progress: 0,
          status: validationError ? "error" : "uploading",
          error: validationError || undefined,
        };

        setFiles((prev) => [...prev, fileEntry]);

        if (validationError) continue;

        try {
          // Request upload intent from server
          const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              portfolioId,
              fileName: file.name,
              mimeType: file.type,
              sizeBytes: file.size,
            }),
          });

          const result = await response.json();

          if (!result.data?.uploadUrl) {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileEntry.id
                  ? { ...f, status: "error" as const, error: result.error?.message || "Upload failed" }
                  : f
              )
            );
            continue;
          }

          // Upload file directly to storage
          const uploadResponse = await fetch(result.data.uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
          });

          if (!uploadResponse.ok) {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileEntry.id
                  ? { ...f, status: "error" as const, error: "Upload failed" }
                  : f
              )
            );
            continue;
          }

          // Confirm upload with server
          await fetch(`/api/documents/${result.data.documentId}/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });

          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileEntry.id
                ? { ...f, id: result.data.documentId, status: "ready" as const, progress: 100 }
                : f
            )
          );
        } catch {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === fileEntry.id
                ? { ...f, status: "error" as const, error: "Upload failed" }
                : f
            )
          );
        }
      }
    },
    [validateFile]
  );

  function handleConsentAccepted() {
    setShowConsent(false);
    setConsentChecked(true);
    if (pendingFiles) {
      processFiles(pendingFiles);
      setPendingFiles(null);
    }
  }

  function handleConsentDeclined() {
    setShowConsent(false);
    setPendingFiles(null);
    setError("Upload cancelled. You must accept the privacy and AI-processing terms to upload documents.");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFileSelect(e.dataTransfer.files);
  }

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleStart() {
    if (!canStart) return;
    setStarting(true);
    setError(null);

    try {
      const supabase = await createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Your session has expired. Please sign in again.");
        return;
      }

      const response = await fetch("/api/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          goal,
          appointment: appointmentDate
            ? {
                startsAt: appointmentDate + (appointmentTime ? `T${appointmentTime}` : "T09:00"),
                timezone,
                specialty: specialty || undefined,
                clinicianName: clinicianName || undefined,
                location: location || undefined,
              }
            : undefined,
          documentIds: files
            .filter((f) => f.status === "ready")
            .map((f) => f.id),
        }),
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error.message);
        return;
      }

      router.push(`/runs/${result.data.runId}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-8">
      <ConsentModal
        isOpen={showConsent}
        onAccepted={handleConsentAccepted}
        onDeclined={handleConsentDeclined}
      />
      <div>
        <h1 className="text-2xl font-semibold text-text-primary md:text-3xl">
          New preparation
        </h1>
        <p className="mt-1 text-text-secondary">
          Tell Healthfolio your goal and upload the relevant records.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        <StepDot active label="1" text="Goal" />
        <div className="h-px flex-1 bg-border" />
        <StepDot active={hasGoal} label="2" text="Documents" />
        <div className="h-px flex-1 bg-border" />
        <StepDot label="3" text="Review" />
        <div className="h-px flex-1 bg-border" />
        <StepDot label="4" text="Prepared" />
      </div>

      {error && <ErrorMessage message={error} />}

      {/* Goal section */}
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-text-primary">
          Your preparation goal
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Describe what you want to prepare for. This helps Healthfolio focus its analysis.
        </p>
        <div className="mt-4 space-y-4">
          <Textarea
            label="Goal"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="For example: Organize my medical records and prepare me for my cardiology appointment next Monday."
            helpText="1-1000 characters"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Appointment date"
              type="date"
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
            />
            <Input
              label="Appointment time"
              type="time"
              value={appointmentTime}
              onChange={(e) => setAppointmentTime(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              options={TIMEZONES}
            />
            <Input
              label="Specialty (optional)"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              placeholder="e.g. Cardiology"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Doctor name (optional)"
              value={clinicianName}
              onChange={(e) => setClinicianName(e.target.value)}
              placeholder="Dr. Smith"
            />
            <Input
              label="Location (optional)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City Hospital, Room 305"
            />
          </div>
        </div>
      </Card>

      {/* Upload section */}
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-text-primary">
          Upload documents
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          PDF, PNG, or JPEG files up to 10 MB each.
        </p>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="mt-4 flex flex-col items-center justify-center rounded-card border-2 border-dashed border-border p-8 text-center hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          aria-label="Upload documents"
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            className="text-text-secondary"
            aria-hidden="true"
          >
            <rect x="4" y="8" width="32" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M20 16v8M16 20h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="mt-3 text-sm font-medium text-text-primary">
            Drag files here or click to browse
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            PDF, PNG, JPEG — max 10 MB each
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            aria-label="Select files to upload"
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 rounded-card border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {file.fileName}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB
                    {file.status === "error" && file.error && (
                      <span className="ml-2 text-error">— {file.error}</span>
                    )}
                    {file.status === "ready" && (
                      <span className="ml-2 text-success">— Ready</span>
                    )}
                    {file.status === "uploading" && (
                      <span className="ml-2 text-info">— Uploading…</span>
                    )}
                  </p>
                </div>
                {file.status === "uploading" && <Spinner size="sm" />}
                {file.status === "ready" && (
                  <span className="text-success" aria-label="Ready">✓</span>
                )}
                <button
                  onClick={() => removeFile(file.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-canvas hover:text-error transition-colors"
                  aria-label={`Remove ${file.fileName}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Start button */}
      <div className="flex justify-end pb-8">
        <Button
          onClick={handleStart}
          disabled={!canStart}
          loading={starting}
          loadingText="Starting…"
          size="lg"
        >
          Start document processing
        </Button>
      </div>
    </div>
  );
}

function StepDot({
  active,
  label,
  text,
}: {
  active?: boolean;
  label: string;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={[
          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
          active
            ? "bg-primary text-white"
            : "bg-border text-text-secondary",
        ].join(" ")}
      >
        {label}
      </div>
      <span
        className={[
          "text-sm font-medium hidden sm:inline",
          active ? "text-text-primary" : "text-text-secondary",
        ].join(" ")}
      >
        {text}
      </span>
    </div>
  );
}
