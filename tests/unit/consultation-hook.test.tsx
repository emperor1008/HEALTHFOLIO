/**
 * useConsultation orchestrator tests (REAL hook, mocked HTTP only).
 *
 * Proves the Phase 1 honesty contract end-to-end at the hook seam:
 * - session load states (unauthorized / not_found / error / ready) come from
 *   real responses — never a fallback that pretends success;
 * - with Supabase Realtime unconfigured (placeholder env), join fails with a
 *   typed signalling error BEFORE any permission prompt or WebRTC object;
 * - a non-joinable session can never start media (room capability missing);
 * - the machine state stays pure (idle until a real join).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useConsultation } from "@/lib/consultation/use-consultation";
import type { ConsultationSession } from "@/lib/consultation/types";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
const originalEnv: Record<string, string | undefined> = {};

function sessionFixture(overrides: Partial<ConsultationSession> = {}): ConsultationSession {
  return {
    id: "appt-1",
    role: "patient",
    state: "appointment_confirmed",
    mode: "text",
    careRequestId: null,
    proposedStartsAt: null,
    confirmedStartsAt: null,
    roomChannel: "consultation:11111111-2222-4333-8444-555555555555",
    participantId: "participant-1",
    reason: null,
    triageCategory: null,
    ...overrides,
  };
}

function okResponse(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  // Default: deployment with placeholder Supabase env (unconfigured realtime).
  process.env.NEXT_PUBLIC_SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";
  fetchMock.mockReset();
  // Re-stub every test: afterEach unstubs globals, which would otherwise
  // fall back to jsdom's real fetch after the first test.
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.unstubAllGlobals();
});

describe("session load (real hook)", () => {
  it("401 → unauthorized, never a fake ready session", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 } as Response);
    const { result } = renderHook(() => useConsultation("appt-1"));
    expect(result.current.sessionLoad).toBe("loading");
    expect(result.current.state.status).toBe("idle");
    await waitFor(() => expect(result.current.sessionLoad).toBe("unauthorized"));
    expect(result.current.session).toBeNull();
  });

  it("403 → unauthorized; 404 → not_found; 500 → error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 } as Response);
    const first = renderHook(() => useConsultation("appt-1"));
    await waitFor(() => expect(first.result.current.sessionLoad).toBe("unauthorized"));
    first.unmount();

    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);
    const second = renderHook(() => useConsultation("appt-1"));
    await waitFor(() => expect(second.result.current.sessionLoad).toBe("not_found"));
    second.unmount();

    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
    const third = renderHook(() => useConsultation("appt-1"));
    await waitFor(() => expect(third.result.current.sessionLoad).toBe("error"));
  });

  it("network failure (offline) → honest error state, not ready", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useConsultation("appt-1"));
    await waitFor(() => expect(result.current.sessionLoad).toBe("error"));
    expect(result.current.session).toBeNull();
  });

  it("200 with a joinable session → ready, with live availability computed from env", async () => {
    fetchMock.mockResolvedValue(okResponse({ session: sessionFixture() }));
    const { result } = renderHook(() => useConsultation("appt-1"));
    await waitFor(() => expect(result.current.sessionLoad).toBe("ready"));
    expect(result.current.session?.roomChannel).toContain("consultation:");
    // Placeholder env → realtime honestly unavailable.
    expect(result.current.liveCallAvailable).toBe(false);
    expect(result.current.state.status).toBe("idle");
  });

  it("reloadSession re-fetches after a failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(
      okResponse({ session: sessionFixture() })
    );
    const { result } = renderHook(() => useConsultation("appt-1"));
    await waitFor(() => expect(result.current.sessionLoad).toBe("error"));
    act(() => result.current.reloadSession());
    expect(result.current.sessionLoad).toBe("loading");
    await waitFor(() => expect(result.current.sessionLoad).toBe("ready"));
  });
});

describe("join honesty (real hook, no WebRTC in jsdom)", () => {
  it("unconfigured realtime → typed error, NO permission prompt, no connected claim", async () => {
    fetchMock.mockResolvedValue(okResponse({ session: sessionFixture() }));
    const mediaMock = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: mediaMock },
    });

    const { result } = renderHook(() => useConsultation("appt-1"));
    await waitFor(() => expect(result.current.sessionLoad).toBe("ready"));

    await act(async () => {
      await result.current.join("audio");
    });

    expect(result.current.state.status).toBe("error");
    expect(result.current.state.error).toBe("signalling_unavailable");
    // Permission is never requested when a call cannot be attempted anyway.
    expect(mediaMock).not.toHaveBeenCalled();
    expect(result.current.localStream).toBeNull();
    Reflect.deleteProperty(navigator, "mediaDevices");
  });

  it("configured realtime but no room capability → room_not_available before any media", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key-0123456789";
    fetchMock.mockResolvedValue(
      okResponse({ session: sessionFixture({ roomChannel: null }) })
    );
    const mediaMock = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: mediaMock },
    });

    const { result } = renderHook(() => useConsultation("appt-1"));
    await waitFor(() => expect(result.current.sessionLoad).toBe("ready"));
    expect(result.current.liveCallAvailable).toBe(true);

    await act(async () => {
      await result.current.join("video");
    });

    expect(result.current.state.status).toBe("error");
    expect(result.current.state.error).toBe("room_not_available");
    expect(mediaMock).not.toHaveBeenCalled();
    Reflect.deleteProperty(navigator, "mediaDevices");
  });
});
