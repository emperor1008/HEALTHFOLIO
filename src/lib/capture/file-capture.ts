/**
 * File capture utility: validate files, analyze quality, create CapturedPage objects.
 */

import { validateFile, computeFileHash, createPreviewUrl } from "./image-transform";
import { analyzeImageQuality } from "./image-quality";
import type { CapturedPage } from "./types";

export async function captureFilePages(files: File[]): Promise<CapturedPage[]> {
  const pages: CapturedPage[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    const validation = validateFile(file);
    if (!validation.valid) {
      // Create a page with unusable quality
      pages.push({
        id: crypto.randomUUID(),
        pageNumber: i + 1,
        blob: file,
        previewUrl: createPreviewUrl(file),
        width: 0,
        height: 0,
        rotation: 0,
        fileSize: file.size,
        quality: {
          status: "unusable",
          checks: {
            dimensions: { width: 0, height: 0, ok: false },
            blur: { score: 0, ok: false },
            brightness: { score: 0, ok: false },
            contrast: { score: 0, ok: false },
          },
          warnings: [validation.error || "Unsupported file"],
        },
        uploadStatus: "pending",
      });
      continue;
    }

    // For PDFs, skip image quality checks
    if (file.type === "application/pdf") {
      const hash = await computeFileHash(file);
      pages.push({
        id: crypto.randomUUID(),
        pageNumber: i + 1,
        blob: file,
        previewUrl: createPreviewUrl(file),
        width: 0,
        height: 0,
        rotation: 0,
        fileSize: file.size,
        quality: {
          status: "acceptable",
          checks: {
            dimensions: { width: 0, height: 0, ok: true },
            blur: { score: 100, ok: true },
            brightness: { score: 128, ok: true },
            contrast: { score: 80, ok: true },
          },
          warnings: [],
        },
        uploadStatus: "pending",
        fileHash: hash,
      });
      continue;
    }

    // For images, analyze quality
    try {
      const [quality, hash, dimensions] = await Promise.all([
        analyzeImageQuality(file),
        computeFileHash(file),
        getImageDimensions(file),
      ]);

      pages.push({
        id: crypto.randomUUID(),
        pageNumber: i + 1,
        blob: file,
        previewUrl: createPreviewUrl(file),
        width: dimensions.width,
        height: dimensions.height,
        rotation: 0,
        fileSize: file.size,
        quality,
        uploadStatus: "pending",
        fileHash: hash,
      });
    } catch {
      pages.push({
        id: crypto.randomUUID(),
        pageNumber: i + 1,
        blob: file,
        previewUrl: createPreviewUrl(file),
        width: 0,
        height: 0,
        rotation: 0,
        fileSize: file.size,
        quality: {
          status: "unusable",
          checks: {
            dimensions: { width: 0, height: 0, ok: false },
            blur: { score: 0, ok: false },
            brightness: { score: 0, ok: false },
            contrast: { score: 0, ok: false },
          },
          warnings: ["Could not analyze image quality"],
        },
        uploadStatus: "pending",
      });
    }
  }

  return pages;
}

function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("IMAGE_DECODE_FAILED"));
    };
    img.src = url;
  });
}
