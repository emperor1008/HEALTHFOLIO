/**
 * Server-side idempotency for queued writes.
 *
 * Each queued offline action sends the same Idempotency-Key header on every
 * replay. The API stores the first response per (user, endpoint, key) and
 * replays it verbatim, so retried requests can never create duplicates.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface IdempotentResult<T> {
  replayed: boolean;
  response: T;
}

/** Look up a stored response for this user/endpoint/key. */
export async function lookupIdempotentResponse<T>(
  userId: string,
  endpoint: string,
  key: string | null
): Promise<IdempotentResult<T> | null> {
  if (!key) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("idempotency_keys")
    .select("response_status, response_body")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .eq("idempotency_key", key)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { replayed: true, response: data.response_body as T };
}

/**
 * Store a response for future replay. Best-effort: failure to store never
 * breaks the primary operation (it only removes duplicate protection).
 */
export async function storeIdempotentResponse(
  userId: string,
  endpoint: string,
  key: string | null,
  status: number,
  body: unknown
): Promise<void> {
  if (!key) return;
  const admin = createAdminClient();
  const { error } = await admin.from("idempotency_keys").insert({
    user_id: userId,
    endpoint: endpoint,
    idempotency_key: key,
    response_status: status,
    response_body: body,
  });
  if (error) {
    // Log id/endpoint only — never log response bodies or keys of secrets.
    console.error("[idempotency] store failed", { endpoint });
  }
}
