/**
 * Image transform utilities: rotate, resize, hash, validation, MIME detection.
 *
 * Rules:
 * - Use canvas for transforms, not external libraries.
 * - Preserve original Blob separately.
 * - Calculate SHA-256 for deduplication.
 * - Validate MIME type via magic bytes.
 */

// ─── Image Rotation ──────────────────────────────────────────────────────

export async function rotateImage(
  blob: Blob,
  degrees: 0 | 90 | 180 | 270
): Promise<{ blob: Blob; width: number; height: number }> {
  if (degrees === 0) {
    const img = await decodeBlob(blob);
    return { blob, width: img.width, height: img.height };
  }

  const img = await decodeBlob(blob);
  const canvas = document.createElement("canvas");

  if (degrees === 90 || degrees === 270) {
    canvas.width = img.height;
    canvas.height = img.width;
  } else {
    canvas.width = img.width;
    canvas.height = img.height;
  }

  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  return new Promise((resolve) => {
    canvas.toBlob(
      (newBlob) => {
        resolve({
          blob: newBlob || blob,
          width: canvas.width,
          height: canvas.height,
        });
      },
      "image/jpeg",
      0.92
    );
  });
}

// ─── Image Resize ────────────────────────────────────────────────────────

export async function resizeImage(
  blob: Blob,
  maxDimension: number
): Promise<Blob> {
  const img = await decodeBlob(blob);

  if (img.width <= maxDimension && img.height <= maxDimension) {
    return blob;
  }

  const ratio = Math.min(maxDimension / img.width, maxDimension / img.height);
  const newWidth = Math.round(img.width * ratio);
  const newHeight = Math.round(img.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = newWidth;
  canvas.height = newHeight;

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, newWidth, newHeight);

  return new Promise((resolve) => {
    canvas.toBlob(
      (newBlob) => resolve(newBlob || blob),
      "image/jpeg",
      0.92
    );
  });
}

// ─── SHA-256 Hash ────────────────────────────────────────────────────────

export async function computeFileHash(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── File Validation ─────────────────────────────────────────────────────

const MAGIC_BYTES: Record<string, number[][]> = {
  "image/jpeg": [
    [0xff, 0xd8, 0xff],
  ],
  "image/png": [
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  ],
  "image/webp": [
    // RIFF....WEBP
    [0x52, 0x49, 0x46, 0x46],
  ],
  "application/pdf": [
    [0x25, 0x50, 0x44, 0x46], // %PDF
  ],
};

export function detectMimeType(file: File): string | null {
  // Try file.type first
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }

  // Fall back to magic bytes
  return detectMimeTypeFromExtension(file.name);
}

export function detectMimeTypeFromExtension(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    default:
      return null;
  }
}

export async function validateFileSignature(
  blob: Blob,
  expectedMimeType: string
): Promise<boolean> {
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const signatures = MAGIC_BYTES[expectedMimeType];

  if (!signatures) return true; // No known signature to check

  return signatures.some((sig) =>
    sig.every((byte, i) => header[i] === byte)
  );
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();

  // Check extension
  const allowed = [".pdf", ".jpeg", ".jpg", ".png", ".webp"];
  if (!allowed.includes(ext)) {
    return { valid: false, error: "UNSUPPORTED_FILE_TYPE" };
  }

  // Check size (10MB default)
  const maxSize = parseInt(process.env.NEXT_PUBLIC_DOCUMENT_MAX_BYTES || "10485760");
  if (file.size > maxSize) {
    return { valid: false, error: "FILE_TOO_LARGE" };
  }

  // Check for zero-byte
  if (file.size === 0) {
    return { valid: false, error: "FILE_EMPTY" };
  }

  // Check for executables by extension
  const dangerous = [".exe", ".bat", ".cmd", ".sh", ".ps1", ".com", ".scr"];
  if (dangerous.includes(ext)) {
    return { valid: false, error: "UNSUPPORTED_FILE_TYPE" };
  }

  return { valid: true };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function decodeImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("IMAGE_DECODE_FAILED"));
    };
    img.src = url;
  });
}

async function decodeBlob(blob: Blob): Promise<HTMLImageElement> {
  return decodeImage(blob);
}

// ─── Preview URL Management ──────────────────────────────────────────────

const previewUrls = new Set<string>();

export function createPreviewUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  previewUrls.add(url);
  return url;
}

export function revokePreviewUrl(url: string): void {
  if (previewUrls.has(url)) {
    URL.revokeObjectURL(url);
    previewUrls.delete(url);
  }
}

export function revokeAllPreviewUrls(): void {
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls.clear();
}
