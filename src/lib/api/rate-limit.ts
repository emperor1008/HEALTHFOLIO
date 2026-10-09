/**
 * Small in-memory sliding-window rate limiter for sensitive, non-auth-API
 * endpoints (doctor applications, admin invites). Better Auth rate-limits the
 * credential endpoints themselves; this covers our own API routes.
 *
 * The store is per-process. For multi-instance production deployments, swap
 * `hit()`'s store for a shared backend (documented in README). The limiter is
 * fail-open on internal errors so it can never take down a health route.
 */

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function hit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  try {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    let bucket = buckets.get(key);
    if (!bucket) {
      // Bound memory: drop the oldest half when the map grows too large.
      if (buckets.size >= MAX_BUCKETS) {
        const keys = Array.from(buckets.keys()).slice(0, Math.floor(MAX_BUCKETS / 2));
        for (const k of keys) buckets.delete(k);
      }
      bucket = { timestamps: [] };
      buckets.set(key, bucket);
    }
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
    if (bucket.timestamps.length >= limit) {
      const oldest = bucket.timestamps[0] ?? now;
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
      };
    }
    bucket.timestamps.push(now);
    return { allowed: true, retryAfterSeconds: 0 };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/** Test-only: clear all buckets. */
export function resetRateLimiter(): void {
  buckets.clear();
}
