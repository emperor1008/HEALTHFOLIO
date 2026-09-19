/**
 * File validation tests: accepted/rejected types and size limits via the
 * existing magic-byte-aware validateFile, plus quality-check result handling.
 */

import { describe, it, expect } from "vitest";
import { validateFile } from "@/lib/capture/image-transform";
import { getQualityLabel, getQualityColor } from "@/lib/capture/image-quality";
import { decideCaptureStrategy } from "@/lib/capture/offline-staging";
import { detectEmergencyText } from "@/lib/care/emergency-notice";

function makeFile(name: string, size: number, type: string, magic?: number[]): File {
  const header = magic ?? [0xff, 0xd8, 0xff]; // default JPEG magic
  const body = new Array(Math.max(0, size - header.length)).fill(0x41);
  const bytes = new Uint8Array([...header, ...body]);
  return new File([bytes], name, { type });
}

describe("file type validation", () => {
  it("accepts the supported formats: pdf, jpg, jpeg, png, webp", () => {
    expect(validateFile(makeFile("report.pdf", 1000, "application/pdf", [0x25, 0x50, 0x44, 0x46]))).toEqual({ valid: true });
    expect(validateFile(makeFile("scan.jpg", 1000, "image/jpeg"))).toEqual({ valid: true });
    expect(validateFile(makeFile("scan.jpeg", 1000, "image/jpeg"))).toEqual({ valid: true });
    expect(validateFile(makeFile("scan.png", 1000, "image/png", [0x89, 0x50, 0x4e, 0x47]))).toEqual({ valid: true });
    expect(validateFile(makeFile("scan.webp", 1000, "image/webp", [0x52, 0x49, 0x46, 0x46]))).toEqual({ valid: true });
  });

  it("rejects unsupported formats before anything is queued", () => {
    expect(validateFile(makeFile("notes.txt", 100, "text/plain"))).toEqual({
      valid: false,
      error: "UNSUPPORTED_FILE_TYPE",
    });
    expect(validateFile(makeFile("page.docx", 100, "application/msword"))).toEqual({
      valid: false,
      error: "UNSUPPORTED_FILE_TYPE",
    });
    expect(validateFile(makeFile("virus.exe", 100, "application/octet-stream"))).toEqual({
      valid: false,
      error: "UNSUPPORTED_FILE_TYPE",
    });
  });

  it("rejects empty and oversized files", () => {
    const empty = makeFile("scan.jpg", 1, "image/jpeg");
    Object.defineProperty(empty, "size", { value: 0 });
    expect(validateFile(empty)).toEqual({ valid: false, error: "FILE_EMPTY" });

    const tooBig = makeFile("scan.jpg", 11 * 1024 * 1024, "image/jpeg");
    expect(validateFile(tooBig)).toEqual({ valid: false, error: "FILE_TOO_LARGE" });
  });
});

describe("quality-check result handling", () => {
  it("maps each status to a plain-language label and calm color", () => {
    expect(getQualityLabel("acceptable")).toBe("Good quality");
    expect(getQualityLabel("warning")).toBe("Quality warning");
    expect(getQualityLabel("retake_recommended")).toBe("Consider retaking");
    expect(getQualityLabel("unusable")).toBe("Unusable");

    expect(getQualityColor("acceptable")).toBe("text-success");
    expect(getQualityColor("warning")).toBe("text-warning");
    expect(getQualityColor("retake_recommended")).toBe("text-warning");
    expect(getQualityColor("unusable")).toBe("text-error");
  });
});

describe("offline capture strategy", () => {
  it("attempts upload when online", () => {
    expect(decideCaptureStrategy(true)).toEqual({ attemptUpload: true, notice: null });
  });

  it("stages locally with a truthful notice when offline", () => {
    expect(decideCaptureStrategy(false)).toEqual({
      attemptUpload: false,
      notice: "SAVED_ON_DEVICE",
    });
  });
});

describe("emergency wording detection (safety notice only)", () => {
  it("detects emergency wording across languages without classifying", () => {
    expect(detectEmergencyText("I have severe chest pain since morning")).toBe(true);
    expect(detectEmergencyText("सीने में दर्द हो रहा है")).toBe(true);
    expect(detectEmergencyText("ଛାତି ଯନ୍ତ୍ରଣା ହେଉଛି")).toBe(true);
  });

  it("does not trigger on ordinary requests", () => {
    expect(detectEmergencyText("I need help understanding my latest report")).toBe(false);
    expect(detectEmergencyText("Please help me book a follow-up")).toBe(false);
  });
});
