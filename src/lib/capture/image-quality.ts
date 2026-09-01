/**
 * Image quality analysis using deterministic canvas-based checks.
 *
 * Runs entirely in the browser — no server calls.
 * No LLM or AI for quality assessment.
 *
 * Checks:
 * - Minimum dimensions
 * - Blur (Laplacian variance)
 * - Brightness (mean luminance)
 * - Contrast (standard deviation of luminance)
 * - Corruption (decoded image integrity)
 */

import type { PageQualityResult, QualityStatus } from "./types";

// ─── Main Quality Check ──────────────────────────────────────────────────

export async function analyzeImageQuality(
  imageBlob: Blob
): Promise<PageQualityResult> {
  const img = await decodeImage(imageBlob);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return unusableResult("Could not analyze image");
  }

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = toGrayscale(imageData);

  const width = img.width;
  const height = img.height;

  // 1. Dimensions check
  const dimensions = checkDimensions(width, height);

  // 2. Blur check (Laplacian variance)
  const blur = checkBlur(gray, width, height);

  // 3. Brightness check
  const brightness = checkBrightness(gray);

  // 4. Contrast check
  const contrast = checkContrast(gray);

  // Release canvas
  canvas.width = 0;
  canvas.height = 0;

  // Determine overall status
  const warnings: string[] = [];
  let worstStatus: QualityStatus = "acceptable";

  if (!dimensions.ok) {
    worstStatus = "unusable";
    warnings.push("Image is too small for reliable text extraction");
  }

  if (!blur.ok) {
    if (blur.score < 30) {
      worstStatus = "retake_recommended";
    } else if (worstStatus !== "unusable") {
      worstStatus = "warning";
    }
    warnings.push(blur.message || "Image may be blurry");
  }

  if (!brightness.ok) {
    if (brightness.score < 20 || brightness.score > 240) {
      worstStatus = "retake_recommended";
    } else if (worstStatus !== "unusable") {
      worstStatus = "warning";
    }
    warnings.push(brightness.message || "Lighting may affect readability");
  }

  if (!contrast.ok) {
    if (worstStatus !== "unusable") {
      worstStatus = "warning";
    }
    warnings.push(contrast.message || "Low contrast detected");
  }

  return {
    status: worstStatus,
    checks: { dimensions, blur, brightness, contrast },
    warnings,
  };
}

// ─── Decode Image ────────────────────────────────────────────────────────

function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      // Verify decoded dimensions are valid
      if (!img.width || !img.height) {
        reject(new Error("IMAGE_DECODE_FAILED"));
        return;
      }
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("IMAGE_DECODE_FAILED"));
    };

    img.src = url;
  });
}

// ─── Grayscale Conversion ────────────────────────────────────────────────

function toGrayscale(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // Standard luminance formula
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  return gray;
}

// ─── Dimension Check ─────────────────────────────────────────────────────

function checkDimensions(
  width: number,
  height: number
): PageQualityResult["checks"]["dimensions"] {
  const MIN = 200;
  const ok = width >= MIN && height >= MIN;

  return {
    width,
    height,
    ok,
  };
}

// ─── Blur Detection (Laplacian Variance) ─────────────────────────────────

function checkBlur(
  gray: Float32Array,
  width: number,
  height: number
): PageQualityResult["checks"]["blur"] {
  // Simplified Laplacian: compute variance of second derivative
  const laplacian: number[] = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap =
        -4 * gray[idx] +
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx - width] +
        gray[idx + width];
      laplacian.push(lap);
    }
  }

  if (laplacian.length === 0) {
    return { score: 0, ok: false, message: "Image too small to analyze" };
  }

  // Mean
  const mean = laplacian.reduce((a, b) => a + b, 0) / laplacian.length;
  // Variance
  const variance =
    laplacian.reduce((sum, val) => sum + (val - mean) ** 2, 0) /
    laplacian.length;

  // Threshold: images with variance < 50 are typically blurry
  const score = Math.round(Math.min(100, variance / 5));
  const ok = variance >= 50;

  return {
    score,
    ok,
    message: ok
      ? undefined
      : "This image may be too blurry for accurate text extraction. Hold the camera steady and retake it.",
  };
}

// ─── Brightness Check ────────────────────────────────────────────────────

function checkBrightness(
  gray: Float32Array
): PageQualityResult["checks"]["brightness"] {
  const mean = gray.reduce((a, b) => a + b, 0) / gray.length;
  const score = Math.round(mean);

  let ok = true;
  let message: string | undefined;

  if (mean < 30) {
    ok = false;
    message =
      "This image is too dark. Move to better lighting and avoid shadows.";
  } else if (mean < 60) {
    ok = false;
    message =
      "This image appears dark. Better lighting will improve text extraction.";
  } else if (mean > 230) {
    ok = false;
    message =
      "This image may be overexposed. Reduce glare and ensure text is clearly visible.";
  } else if (mean > 210) {
    ok = false;
    message =
      "This image appears bright. Ensure text contrast is sufficient.";
  }

  return { score, ok, message };
}

// ─── Contrast Check ──────────────────────────────────────────────────────

function checkContrast(
  gray: Float32Array
): PageQualityResult["checks"]["contrast"] {
  const mean = gray.reduce((a, b) => a + b, 0) / gray.length;
  const variance =
    gray.reduce((sum, val) => sum + (val - mean) ** 2, 0) / gray.length;
  const stdDev = Math.sqrt(variance);
  const score = Math.round(stdDev);

  // Low contrast: standard deviation < 30
  const ok = stdDev >= 30;

  return {
    score,
    ok,
    message: ok
      ? undefined
      : "Low contrast detected. Ensure the document is well-lit and the text is clearly visible against the background.",
  };
}

// ─── Unusable Result ─────────────────────────────────────────────────────

function unusableResult(message: string): PageQualityResult {
  return {
    status: "unusable",
    checks: {
      dimensions: { width: 0, height: 0, ok: false },
      blur: { score: 0, ok: false },
      brightness: { score: 0, ok: false },
      contrast: { score: 0, ok: false },
    },
    warnings: [message],
  };
}

// ─── Quality Status Helpers ──────────────────────────────────────────────

export function getQualityLabel(status: QualityStatus): string {
  switch (status) {
    case "acceptable":
      return "Good quality";
    case "warning":
      return "Quality warning";
    case "retake_recommended":
      return "Consider retaking";
    case "unusable":
      return "Unusable";
  }
}

export function getQualityColor(status: QualityStatus): string {
  switch (status) {
    case "acceptable":
      return "text-success";
    case "warning":
      return "text-warning";
    case "retake_recommended":
      return "text-warning";
    case "unusable":
      return "text-error";
  }
}
