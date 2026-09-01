/**
 * Upload service: session management, signed URL upload, finalization, idempotency.
 *
 * Rules:
 * - Never send large files as JSON or base64.
 * - Use signed upload URLs.
 * - Verify upload server-side before marking complete.
 * - Use idempotency keys.
 * - Support retry.
 * - Do not create document rows before upload verification.
 */

import type { UploadSession, CapturedPage, CaptureSource } from "./types";

// ─── Upload Session Creation ─────────────────────────────────────────────

export async function createUploadSession(params: {
  portfolioId: string;
  sourceType: CaptureSource;
  pageCount: number;
  idempotencyKey: string;
}): Promise<{ session: UploadSession; error?: string }> {
  try {
    const response = await fetch("/api/upload-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: params.portfolioId,
        sourceType: params.sourceType,
        expectedPageCount: params.pageCount,
        idempotencyKey: params.idempotencyKey,
      }),
    });

    const result = await response.json();

    if (result.error) {
      return { session: null as any, error: result.error.message };
    }

    return { session: result.data.session };
  } catch {
    return { session: null as any, error: "NETWORK_ERROR" };
  }
}

// ─── Single Page Upload ──────────────────────────────────────────────────

export interface PageUploadProgress {
  pageId: string;
  status: "preparing" | "uploading" | "verifying" | "complete" | "error";
  progress?: number;
  error?: string;
  storagePath?: string;
}

export async function uploadPage(params: {
  sessionId: string;
  documentId: string;
  page: CapturedPage;
  pageNumber: number;
  onProgress?: (progress: PageUploadProgress) => void;
}): Promise<{ success: boolean; storagePath?: string; error?: string }> {
  const { sessionId, documentId, page, pageNumber, onProgress } = params;

  // 1. Request signed upload URL from server
  onProgress?.({ pageId: page.id, status: "preparing" });

  try {
    const intentResponse = await fetch("/api/upload-sessions/page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        documentId,
        pageNumber,
        fileName: `page-${pageNumber}.jpg`,
        mimeType: page.blob.type || "image/jpeg",
        sizeBytes: page.fileSize,
        fileHash: page.fileHash,
        width: page.width,
        height: page.height,
        rotation: page.rotation,
        qualityStatus: page.quality.status,
        qualityMetrics: page.quality.checks,
      }),
    });

    const intentResult = await intentResponse.json();

    if (intentResult.error) {
      onProgress?.({
        pageId: page.id,
        status: "error",
        error: intentResult.error.message,
      });
      return { success: false, error: intentResult.error.message };
    }

    const { uploadUrl, storagePath, pageId } = intentResult.data;

    // 2. Upload binary to signed URL
    onProgress?.({ pageId: page.id, status: "uploading" });

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      body: page.blob,
      headers: { "Content-Type": page.blob.type || "image/jpeg" },
    });

    if (!uploadResponse.ok) {
      onProgress?.({
        pageId: page.id,
        status: "error",
        error: "Upload failed",
      });
      return { success: false, error: "UPLOAD_FAILED" };
    }

    // 3. Verify upload with server
    onProgress?.({ pageId: page.id, status: "verifying" });

    const verifyResponse = await fetch("/api/upload-sessions/page/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        pageId,
        storagePath,
      }),
    });

    const verifyResult = await verifyResponse.json();

    if (verifyResult.error) {
      onProgress?.({
        pageId: page.id,
        status: "error",
        error: verifyResult.error.message,
      });
      return { success: false, error: verifyResult.error.message };
    }

    onProgress?.({ pageId: page.id, status: "complete", storagePath });

    return { success: true, storagePath };
  } catch {
    onProgress?.({
      pageId: page.id,
      status: "error",
      error: "NETWORK_ERROR",
    });
    return { success: false, error: "NETWORK_ERROR" };
  }
}

// ─── Session Finalization ────────────────────────────────────────────────

export async function finalizeUploadSession(params: {
  sessionId: string;
  pageOrder: string[];
  idempotencyKey: string;
}): Promise<{
  success: boolean;
  documentId?: string;
  error?: string;
}> {
  try {
    const response = await fetch("/api/upload-sessions/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: params.sessionId,
        pageOrder: params.pageOrder,
        idempotencyKey: params.idempotencyKey,
      }),
    });

    const result = await response.json();

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return {
      success: true,
      documentId: result.data.documentId,
    };
  } catch {
    return { success: false, error: "NETWORK_ERROR" };
  }
}

// ─── Session Cancellation ────────────────────────────────────────────────

export async function cancelUploadSession(
  sessionId: string
): Promise<void> {
  try {
    await fetch(`/api/upload-sessions/${sessionId}`, {
      method: "DELETE",
    });
  } catch {
    // Best effort — session will expire
  }
}

// ─── Upload Progress Tracker ─────────────────────────────────────────────

export class UploadProgressTracker {
  private pageProgress: Map<string, PageUploadProgress> = new Map();
  private listeners: Set<() => void> = new Set();

  update(progress: PageUploadProgress): void {
    this.pageProgress.set(progress.pageId, progress);
    this.listeners.forEach((l) => l());
  }

  getProgress(pageId: string): PageUploadProgress | undefined {
    return this.pageProgress.get(pageId);
  }

  getAllProgress(): PageUploadProgress[] {
    return Array.from(this.pageProgress.values());
  }

  getOverallProgress(): {
    total: number;
    completed: number;
    failed: number;
    percent: number;
  } {
    const all = this.getAllProgress();
    const completed = all.filter((p) => p.status === "complete").length;
    const failed = all.filter((p) => p.status === "error").length;
    return {
      total: all.length,
      completed,
      failed,
      percent: all.length > 0 ? Math.round((completed / all.length) * 100) : 0,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
