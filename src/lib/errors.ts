export type ErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_EMAIL_NOT_VERIFIED"
  | "AUTH_SESSION_EXPIRED"
  | "CONSENT_REQUIRED"
  | "FILE_TOO_LARGE"
  | "FILE_UNSUPPORTED"
  | "FILE_CORRUPT"
  | "FILE_DUPLICATE"
  | "STORAGE_FAILED"
  | "AI_TIMEOUT"
  | "AI_INVALID_RESPONSE"
  | "AI_CONFIGURATION_REQUIRED"
  | "LOW_CONFIDENCE"
  | "RUN_BLOCKED"
  | "RUN_LIMIT_REACHED"
  | "EXPORT_FAILED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "SAFETY_VIOLATION"
  | "CONFIGURATION_ERROR"
  | "PARTIAL_DELETION"
  | "AI_CONFIGURATION_REQUIRED"
  | "INTERNAL_ERROR";

export function createError(code: ErrorCode, message: string) {
  return { code, message };
}

export function formatErrorResponse(
  error: { code: string; message: string },
  requestId: string
) {
  return {
    data: null,
    error: { code: error.code, message: error.message },
    requestId,
  };
}

export function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15);
}
