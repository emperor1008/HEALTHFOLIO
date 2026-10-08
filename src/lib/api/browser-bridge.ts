"use client";

/**
 * Browser data bridge — every read/write a page component needs goes through
 * authenticated Healthfolio API routes with the Better Auth session cookie.
 * No database client, keys, or Supabase URLs exist in the browser.
 */

export class BridgeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    throw new BridgeError(401, "Your session has ended. Please sign in again.");
  }
  if (!res.ok) {
    throw new BridgeError(res.status, "Something went wrong. Please try again.");
  }
  return (await res.json()) as T;
}

/** GET wrapper with the same error semantics. */
export async function getJSON<T>(path: string): Promise<T> {
  return request<T>(path);
}

/** POST JSON wrapper. */
export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

/** PATCH JSON wrapper. */
export async function patchJSON<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

/** DELETE wrapper. */
export async function deleteJSON<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}
