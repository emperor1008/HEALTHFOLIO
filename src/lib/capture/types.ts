/**
 * Capture types and state machine for smart document capture.
 *
 * Models the entire lifecycle: source selection → capture → review → upload → processing.
 */

// ─── Capture State Machine ───────────────────────────────────────────────

export const CAPTURE_STATES = [
  "idle",
  "choosing_source",
  "requesting_permission",
  "camera_ready",
  "capturing",
  "reviewing",
  "preparing_upload",
  "uploading",
  "uploaded",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;

export type CaptureState = (typeof CAPTURE_STATES)[number];

export const VALID_CAPTURE_TRANSITIONS: Record<CaptureState, CaptureState[]> = {
  idle: ["choosing_source"],
  choosing_source: ["requesting_permission", "preparing_upload", "cancelled", "failed"],
  requesting_permission: ["camera_ready", "failed", "cancelled"],
  camera_ready: ["capturing", "cancelled", "failed"],
  capturing: ["reviewing", "camera_ready", "cancelled", "failed"],
  reviewing: ["preparing_upload", "camera_ready", "cancelled", "failed"],
  // "completed" from preparing_upload = staged offline (saved on device,
  // no server upload happened) — a truthful terminal state for offline capture.
  preparing_upload: ["uploading", "cancelled", "failed", "completed"],
  uploading: ["uploaded", "failed", "cancelled"],
  uploaded: ["processing", "failed"],
  processing: ["completed", "failed"],
  completed: [],
  failed: ["idle", "choosing_source", "cancelled"],
  cancelled: ["idle"],
};

export function isValidCaptureTransition(from: CaptureState, to: CaptureState): boolean {
  return VALID_CAPTURE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Capture Source ──────────────────────────────────────────────────────

export type CaptureSource = "camera" | "gallery" | "file";

export interface CaptureSourceOption {
  source: CaptureSource;
  label: string;
  description: string;
  icon: string;
}

export const CAPTURE_SOURCES: CaptureSourceOption[] = [
  {
    source: "camera",
    label: "Scan document",
    description: "Take a photo with your camera",
    icon: "📷",
  },
  {
    source: "gallery",
    label: "Choose photos",
    description: "Select images from your gallery",
    icon: "🖼️",
  },
  {
    source: "file",
    label: "Upload file",
    description: "PDF, JPEG, PNG or WebP",
    icon: "📄",
  },
];

// ─── Page Model ──────────────────────────────────────────────────────────

export type QualityStatus = "acceptable" | "warning" | "retake_recommended" | "unusable";

export interface PageQualityResult {
  status: QualityStatus;
  checks: {
    dimensions: { width: number; height: number; ok: boolean };
    blur: { score: number; ok: boolean; message?: string };
    brightness: { score: number; ok: boolean; message?: string };
    contrast: { score: number; ok: boolean; message?: string };
  };
  warnings: string[];
}

export interface CapturedPage {
  id: string;
  pageNumber: number;
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
  rotation: number;
  fileSize: number;
  quality: PageQualityResult;
  uploadStatus: "pending" | "uploading" | "uploaded" | "verified" | "failed";
  storagePath?: string;
  fileHash?: string;
}

// ─── Upload Session ──────────────────────────────────────────────────────

export interface UploadSession {
  id: string;
  userId: string;
  portfolioId: string;
  status: "active" | "uploading" | "finalizing" | "completed" | "failed" | "cancelled";
  sourceType: CaptureSource;
  expectedPageCount: number;
  completedPageCount: number;
  totalBytes: number;
  idempotencyKey: string;
  documentId?: string;
  createdAt: string;
  expiresAt: string;
}

// ─── Camera Permission State ─────────────────────────────────────────────

export type CameraPermissionState =
  | "prompt"
  | "granted"
  | "denied"
  | "unavailable"
  | "insecure_context"
  | "device_not_found"
  | "device_busy";

export interface CameraPermissionInfo {
  state: CameraPermissionState;
  message: string;
  fallbackAvailable: boolean;
}

// ─── Supported Formats ───────────────────────────────────────────────────

export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const SUPPORTED_FILE_TYPES = ["application/pdf", ...SUPPORTED_IMAGE_TYPES] as const;
export const SUPPORTED_EXTENSIONS = [".pdf", ".jpeg", ".jpg", ".png", ".webp"] as const;

export const MAX_FILE_SIZE = parseInt(process.env.NEXT_PUBLIC_DOCUMENT_MAX_BYTES || "10485760"); // 10MB
export const MAX_PAGES = parseInt(process.env.NEXT_PUBLIC_CAPTURE_MAX_PAGES || "25");
export const MAX_IMAGE_DIMENSION = 8192;
export const MIN_IMAGE_DIMENSION = 200;

// ─── Processing Stage ────────────────────────────────────────────────────

export type ProcessingStage =
  | "upload_verified"
  | "reading_document"
  | "identifying_type"
  | "extracting_information"
  | "checking_confidence"
  | "waiting_for_review"
  | "organizing_record"
  | "complete";

export interface ProcessingStatus {
  stage: ProcessingStage;
  message: string;
  progress?: number;
  error?: string;
}
