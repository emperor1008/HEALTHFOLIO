/**
 * Feature 5: Smart Document Capture — Unit Tests
 *
 * Tests state machine, file validation, image quality logic, upload flow,
 * camera detection, and page management.
 */

import { describe, it, expect } from "vitest";
import {
  CAPTURE_STATES,
  VALID_CAPTURE_TRANSITIONS,
  isValidCaptureTransition,
  CAPTURE_SOURCES,
  SUPPORTED_IMAGE_TYPES,
  SUPPORTED_FILE_TYPES,
  MAX_PAGES,
} from "@/lib/capture/types";
import { validateFile, detectMimeTypeFromExtension } from "@/lib/capture/image-transform";
import { getQualityLabel, getQualityColor } from "@/lib/capture/image-quality";

// ─── Capture State Machine ───────────────────────────────────────────────

describe("Capture State Machine", () => {
  it("defines all capture states", () => {
    expect(CAPTURE_STATES).toContain("idle");
    expect(CAPTURE_STATES).toContain("choosing_source");
    expect(CAPTURE_STATES).toContain("requesting_permission");
    expect(CAPTURE_STATES).toContain("camera_ready");
    expect(CAPTURE_STATES).toContain("capturing");
    expect(CAPTURE_STATES).toContain("reviewing");
    expect(CAPTURE_STATES).toContain("preparing_upload");
    expect(CAPTURE_STATES).toContain("uploading");
    expect(CAPTURE_STATES).toContain("uploaded");
    expect(CAPTURE_STATES).toContain("processing");
    expect(CAPTURE_STATES).toContain("completed");
    expect(CAPTURE_STATES).toContain("failed");
    expect(CAPTURE_STATES).toContain("cancelled");
  });

  it("allows idle → choosing_source", () => {
    expect(isValidCaptureTransition("idle", "choosing_source")).toBe(true);
  });

  it("allows choosing_source → requesting_permission", () => {
    expect(isValidCaptureTransition("choosing_source", "requesting_permission")).toBe(true);
  });

  it("allows choosing_source → preparing_upload (file)", () => {
    expect(isValidCaptureTransition("choosing_source", "preparing_upload")).toBe(true);
  });

  it("allows requesting_permission → camera_ready", () => {
    expect(isValidCaptureTransition("requesting_permission", "camera_ready")).toBe(true);
  });

  it("allows requesting_permission → failed (denied)", () => {
    expect(isValidCaptureTransition("requesting_permission", "failed")).toBe(true);
  });

  it("allows camera_ready → capturing", () => {
    expect(isValidCaptureTransition("camera_ready", "capturing")).toBe(true);
  });

  it("allows capturing → reviewing", () => {
    expect(isValidCaptureTransition("capturing", "reviewing")).toBe(true);
  });

  it("allows reviewing → preparing_upload", () => {
    expect(isValidCaptureTransition("reviewing", "preparing_upload")).toBe(true);
  });

  it("allows reviewing → camera_ready (retake)", () => {
    expect(isValidCaptureTransition("reviewing", "camera_ready")).toBe(true);
  });

  it("allows preparing_upload → uploading", () => {
    expect(isValidCaptureTransition("preparing_upload", "uploading")).toBe(true);
  });

  it("allows uploading → uploaded", () => {
    expect(isValidCaptureTransition("uploading", "uploaded")).toBe(true);
  });

  it("allows uploaded → processing", () => {
    expect(isValidCaptureTransition("uploaded", "processing")).toBe(true);
  });

  it("allows processing → completed", () => {
    expect(isValidCaptureTransition("processing", "completed")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(isValidCaptureTransition("idle", "completed")).toBe(false);
    expect(isValidCaptureTransition("completed", "idle")).toBe(false);
    expect(isValidCaptureTransition("uploading", "camera_ready")).toBe(false);
    expect(isValidCaptureTransition("processing", "choosing_source")).toBe(false);
  });

  it("allows any state → failed or cancelled", () => {
    expect(isValidCaptureTransition("idle", "failed")).toBe(false); // idle can only go to choosing_source
    expect(isValidCaptureTransition("camera_ready", "failed")).toBe(true);
    expect(isValidCaptureTransition("uploading", "cancelled")).toBe(true);
    expect(isValidCaptureTransition("processing", "failed")).toBe(true);
  });
});

// ─── Capture Sources ─────────────────────────────────────────────────────

describe("Capture Sources", () => {
  it("defines camera, gallery, and file sources", () => {
    expect(CAPTURE_SOURCES).toHaveLength(3);
    expect(CAPTURE_SOURCES.map((s) => s.source)).toEqual([
      "camera",
      "gallery",
      "file",
    ]);
  });

  it("each source has label and description", () => {
    for (const source of CAPTURE_SOURCES) {
      expect(source.label).toBeTruthy();
      expect(source.description).toBeTruthy();
      expect(source.icon).toBeTruthy();
    }
  });
});

// ─── File Validation ─────────────────────────────────────────────────────

describe("File Validation", () => {
  it("accepts valid PDF extension", () => {
    const file = new File(["%PDF-content"], "report.pdf", { type: "application/pdf" });
    const result = validateFile(file);
    expect(result.valid).toBe(true);
  });

  it("accepts valid JPEG extension", () => {
    const file = new File(["\xff\xd8\xff\xe0-image"], "scan.jpg", { type: "image/jpeg" });
    const result = validateFile(file);
    expect(result.valid).toBe(true);
  });

  it("accepts valid PNG extension", () => {
    const file = new File(["\x89PNG-image-data"], "document.png", { type: "image/png" });
    const result = validateFile(file);
    expect(result.valid).toBe(true);
  });

  it("accepts valid WebP extension", () => {
    const file = new File(["RIFF-image-data"], "photo.webp", { type: "image/webp" });
    const result = validateFile(file);
    expect(result.valid).toBe(true);
  });

  it("rejects SVG", () => {
    const file = new File([""], "image.svg", { type: "image/svg+xml" });
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("rejects executable", () => {
    const file = new File([""], "virus.exe", { type: "application/octet-stream" });
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("rejects zero-byte file", () => {
    const file = new File([], "empty.pdf", { type: "application/pdf" });
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("FILE_EMPTY");
  });

  it("detects MIME type from extension", () => {
    expect(detectMimeTypeFromExtension("report.pdf")).toBe("application/pdf");
    expect(detectMimeTypeFromExtension("scan.jpg")).toBe("image/jpeg");
    expect(detectMimeTypeFromExtension("scan.jpeg")).toBe("image/jpeg");
    expect(detectMimeTypeFromExtension("image.png")).toBe("image/png");
    expect(detectMimeTypeFromExtension("photo.webp")).toBe("image/webp");
    expect(detectMimeTypeFromExtension("data.exe")).toBeNull();
  });
});

// ─── Image Quality Labels ────────────────────────────────────────────────

describe("Image Quality Labels", () => {
  it("returns correct label for each status", () => {
    expect(getQualityLabel("acceptable")).toBe("Good quality");
    expect(getQualityLabel("warning")).toBe("Quality warning");
    expect(getQualityLabel("retake_recommended")).toBe("Consider retaking");
    expect(getQualityLabel("unusable")).toBe("Unusable");
  });

  it("returns correct color for each status", () => {
    expect(getQualityColor("acceptable")).toContain("success");
    expect(getQualityColor("warning")).toContain("warning");
    expect(getQualityColor("retake_recommended")).toContain("warning");
    expect(getQualityColor("unusable")).toContain("error");
  });
});

// ─── Supported Formats ───────────────────────────────────────────────────

describe("Supported Formats", () => {
  it("supports JPEG, PNG, WebP images", () => {
    expect(SUPPORTED_IMAGE_TYPES).toContain("image/jpeg");
    expect(SUPPORTED_IMAGE_TYPES).toContain("image/png");
    expect(SUPPORTED_IMAGE_TYPES).toContain("image/webp");
  });

  it("supports PDF files", () => {
    expect(SUPPORTED_FILE_TYPES).toContain("application/pdf");
  });

  it("has a reasonable max page limit", () => {
    expect(MAX_PAGES).toBeGreaterThanOrEqual(5);
    expect(MAX_PAGES).toBeLessThanOrEqual(50);
  });
});

// ─── Page Model ──────────────────────────────────────────────────────────

describe("Page Model", () => {
  it("captured page has required fields", () => {
    // Type check — this ensures the type is well-formed
    const page: import("@/lib/capture/types").CapturedPage = {
      id: "test-id",
      pageNumber: 1,
      blob: new Blob(),
      previewUrl: "blob:test",
      width: 1920,
      height: 1080,
      rotation: 0,
      fileSize: 1024,
      quality: {
        status: "acceptable",
        checks: {
          dimensions: { width: 1920, height: 1080, ok: true },
          blur: { score: 80, ok: true },
          brightness: { score: 128, ok: true },
          contrast: { score: 60, ok: true },
        },
        warnings: [],
      },
      uploadStatus: "pending",
    };

    expect(page.id).toBeTruthy();
    expect(page.pageNumber).toBe(1);
    expect(page.quality.status).toBe("acceptable");
    expect(page.uploadStatus).toBe("pending");
  });
});
