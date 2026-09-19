/**
 * Offline staging bridge for record capture.
 *
 * decideCaptureStrategy says whether an immediate upload should be attempted
 * or the capture should be staged in the offline queue. Staged items keep
 * the original file bytes in IndexedDB blob storage and upload automatically
 * when connectivity returns.
 */

import type { QueueItem } from "@/lib/offline/types";

export interface CaptureOfflineDecision {
  /** True when an immediate upload attempt should be made. */
  attemptUpload: boolean;
  /** Truthful reason shown to the user when staging instead of uploading. */
  notice: "SAVED_ON_DEVICE" | "UPLOAD_FAILED_QUEUED" | null;
}

export function decideCaptureStrategy(online: boolean): CaptureOfflineDecision {
  if (online) {
    return { attemptUpload: true, notice: null };
  }
  return { attemptUpload: false, notice: "SAVED_ON_DEVICE" };
}

/** Stage a captured file into the offline queue for later upload. */
export async function stageCaptureUpload(
  file: File,
  stagePurpose: "record" | "care_request_attachment",
  stageUpload: (input: { file: File; stagePurpose: "record" | "care_request_attachment" }) => Promise<QueueItem>
): Promise<QueueItem> {
  return stageUpload({ file, stagePurpose });
}
