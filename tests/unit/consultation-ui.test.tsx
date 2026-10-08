/**
 * Consultation UI tests (Phase 1 — real state machine wiring).
 *
 * Proves:
 * - offline messages persist through provider remount (refresh simulation)
 *   and never claim "delivered" before server ack;
 * - the join lobby wires to the consultation orchestrator (permission is
 *   only ever requested from the real join path, never on render);
 * - honest degradation: no fake "connected" claim, realtime-unavailable
 *   shows text fallback, session errors are recoverable, store-and-forward
 *   and bounded reconnection states render truthfully;
 * - aria-live announces status changes and no raw errors render.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncProvider, useSync } from "@/lib/offline/sync-provider";
import { LanguageProvider } from "@/lib/i18n/language-context";
import type { QueueItem } from "@/lib/offline/types";
import type { UseConsultationResult } from "@/lib/consultation/use-consultation";
import { MediaAcquireError } from "@/lib/consultation/media";
import ConsultationPage from "@/app/(app)/consultations/[id]/page";

// ── Module mocks ──────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "appt-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const hoisted = vi.hoisted(() => ({ consult: { current: null as unknown } }));

vi.mock("@/lib/consultation/use-consultation", () => ({
  useConsultation: () => hoisted.consult.current,
}));

let backing = new Map<string, QueueItem>();
const memoryStoreSingleton = {
  async getAll() {
    return [...backing.values()].map((i) => structuredClone(i));
  },
  async put(item: QueueItem) {
    backing.set(item.id, structuredClone(item));
  },
  async update(item: QueueItem) {
    backing.set(item.id, structuredClone(item));
  },
  async remove(id: string) {
    backing.delete(id);
  },
  async countByState(state: string) {
    return [...backing.values()].filter((i) => i.state === state).length;
  },
  async putBlob() {},
  async getBlob() {
    return undefined;
  },
  async removeBlob() {},
};

vi.mock("@/lib/offline/storage", () => ({
  getOfflineStore: () => memoryStoreSingleton,
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// ── Consultation orchestrator fixture ─────────────────────────────────────

function makeConsult(overrides: Partial<UseConsultationResult> = {}): UseConsultationResult {
  return {
    session: {
      id: "appt-1",
      role: "patient",
      state: "appointment_confirmed",
      mode: "text",
      careRequestId: null,
      proposedStartsAt: null,
      confirmedStartsAt: null,
      roomChannel: "consultation:room-1",
      participantId: "participant-1",
      reason: "Fever for two days",
      triageCategory: "routine",
    },
    sessionLoad: "ready",
    state: { status: "idle", mode: "text", error: null, retryAttempt: 0 },
    profile: {
      online: true,
      effectiveType: "4g",
      downlinkMbps: 10,
      rttMs: 40,
      saveData: false,
      quality: "good",
      sampledAt: 0,
    },
    videoLevel: "medium",
    localStream: null,
    remoteStream: null,
    micMuted: false,
    cameraOff: false,
    mediaError: null,
    liveCallAvailable: true,
    peerPresent: false,
    transportState: "disconnected",
    recommendation: null,
    degradationCount: 0,
    audioFallbackCount: 0,
    reconnectionCount: 0,
    diagnostics: [],
    join: vi.fn(),
    switchMode: vi.fn(),
    retry: vi.fn(),
    reloadSession: vi.fn(),
    recommendMode: vi.fn(),
    toggleMic: vi.fn(),
    toggleCamera: vi.fn(),
    dismissMediaError: vi.fn(),
    acceptRecommendation: vi.fn(),
    dismissRecommendation: vi.fn(),
    end: vi.fn(),
    ...overrides,
  };
}

function setConsult(result: UseConsultationResult): UseConsultationResult {
  hoisted.consult.current = result;
  return result;
}

// ── Harness (same contract as before: probeRef + restore) ─────────────────

async function renderWithProviders(ui: React.ReactNode, opts: { navigatorOnLine?: boolean } = {}) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: opts.navigatorOnLine ?? true,
  });
  const probeRef: { current: ReturnType<typeof useSync> | null } = { current: null };
  const Probe = () => {
    probeRef.current = useSync();
    return null;
  };
  const rendered = render(
    <SyncProvider>
      <LanguageProvider>
        {ui}
        <Probe />
      </LanguageProvider>
    </SyncProvider>
  );
  return {
    ...rendered,
    probeRef,
    restore: () => {
      if (originalDescriptor) {
        Object.defineProperty(window.navigator, "onLine", originalDescriptor);
      } else {
        Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
      }
    },
  };
}

beforeEach(() => {
  backing = new Map();
  fetchMock.mockReset();
  // Server thread load fails (offline) → local-only view, honestly empty.
  fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
  setConsult(makeConsult());
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Secure text (store-and-forward) ───────────────────────────────────────

describe("secure text (store-and-forward)", () => {
  it("message composed offline is saved to the queue as saved_locally — not delivered", async () => {
    const user = userEvent.setup();
    const utils = await renderWithProviders(<ConsultationPage />, { navigatorOnLine: false });
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    await user.type(screen.getByLabelText(/write a short message|ଲେଖା/i), "Please check my report");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(backing.size).toBe(1));
    await waitFor(() => expect(screen.getByText("Saved on this device")).toBeInTheDocument());
    const item = [...backing.values()][0];
    expect(item.state).toBe("pending");
    expect(item.serverRecordId).toBeUndefined();
    expect(screen.queryByText("Delivered")).not.toBeInTheDocument();
    utils.restore();
  });

  it("queued messages survive a refresh (provider remount) with truthful state", async () => {
    const now = new Date("2026-09-19T10:00:00Z").toISOString();
    backing.set("q-1", {
      id: "q-1",
      idempotencyKey: "key-1",
      actionType: "appointment.message",
      payload: {
        kind: "appointment.message",
        appointmentId: "appt-1",
        body: "Offline message",
        clientCreatedAt: now,
      },
      localCreatedAt: now,
      retryCount: 0,
      state: "pending",
      updatedAt: now,
    });

    // Simulate refresh: fresh mount, store already has the item.
    const user = userEvent.setup();
    const utils = await renderWithProviders(<ConsultationPage />, { navigatorOnLine: false });
    await waitFor(() => expect(utils.probeRef.current?.items.length).toBe(1));
    expect(screen.getByText("Offline message")).toBeInTheDocument();
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();

    // Still functional: a second message can be composed offline.
    await user.type(screen.getByLabelText(/write a short message/i), "second");
    await user.click(screen.getByRole("button", { name: /^send$/i }));
    await waitFor(() => expect(backing.size).toBe(2));
    utils.restore();
  });

  it("synced queue items render as delivered (only after server ack)", async () => {
    const now = new Date("2026-09-19T10:00:00Z").toISOString();
    backing.set("q-2", {
      id: "q-2",
      idempotencyKey: "key-2",
      actionType: "appointment.message",
      payload: {
        kind: "appointment.message",
        appointmentId: "appt-1",
        body: "Synced message",
        clientCreatedAt: now,
      },
      localCreatedAt: now,
      retryCount: 0,
      state: "synced",
      syncedAt: now,
      serverRecordId: "m-1",
      updatedAt: now,
    });
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() => expect(utils.probeRef.current?.items.length).toBe(1));
    expect(screen.getByText("Synced message")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    utils.restore();
  });
});

// ── Join lobby wiring ─────────────────────────────────────────────────────

describe("join lobby wiring", () => {
  it("renders join buttons for a joinable session and never joins on render", async () => {
    const consult = makeConsult();
    setConsult(consult);
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    expect(screen.getByRole("button", { name: /join with video/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join with audio/i })).toBeInTheDocument();
    expect(consult.join).not.toHaveBeenCalled();
    utils.restore();
  });

  it("pressing Join with audio calls the orchestrator with audio only", async () => {
    const consult = makeConsult();
    setConsult(consult);
    const user = userEvent.setup();
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    await user.click(screen.getByRole("button", { name: /join with audio/i }));
    expect(consult.join).toHaveBeenCalledTimes(1);
    expect(consult.join).toHaveBeenCalledWith("audio");
    utils.restore();
  });

  it("announces status changes via aria-live", async () => {
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
    expect(screen.getByTestId("consult-status").textContent).toContain("Ready when you are");
    utils.restore();
  });
});

// ── Honest degradation ────────────────────────────────────────────────────

describe("honest degradation", () => {
  it("realtime unavailable → text fallback, no join buttons, no fake connected", async () => {
    setConsult(makeConsult({ liveCallAvailable: false }));
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    expect(screen.getByText(/live audio\/video is not available right now/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /join with video/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Connected to your doctor")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/write a short message/i)).toBeInTheDocument();
    utils.restore();
  });

  it("session not joinable yet → honest note, no join buttons", async () => {
    const base = makeConsult();
    setConsult(
      makeConsult({
        session: { ...base.session!, roomChannel: null },
      })
    );
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    expect(screen.getByText(/not confirmed yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /join with video/i })).not.toBeInTheDocument();
    utils.restore();
  });

  it("unauthorized session load blocks the lobby entirely", async () => {
    setConsult(makeConsult({ sessionLoad: "unauthorized" }));
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() =>
      expect(screen.getByText(/do not have access to this consultation/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: /join with video/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Connected to your doctor")).not.toBeInTheDocument();
    utils.restore();
  });

  it("failed session load offers a real retry that calls reloadSession", async () => {
    const consult = makeConsult({ sessionLoad: "error" });
    setConsult(consult);
    const user = userEvent.setup();
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() =>
      expect(screen.getByText(/could not load this consultation/i)).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(consult.reloadSession).toHaveBeenCalledTimes(1);
    utils.restore();
  });

  it("media error state shows typed recovery options, never a raw error", async () => {
    const consult = makeConsult({
      state: { status: "error", mode: "text", error: "permission_denied", retryAttempt: 0 },
      mediaError: new MediaAcquireError("permission_denied", "audio+video", [
        "retry",
        "continue_audio",
        "continue_text",
      ]),
    });
    setConsult(consult);
    const user = userEvent.setup();
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() =>
      expect(screen.getByText(/camera or microphone permission was denied/i)).toBeInTheDocument()
    );

    // Recovery paths.
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with audio/i })).toBeInTheDocument();
    // No fake connected claim.
    expect(screen.queryByText("Connected to your doctor")).not.toBeInTheDocument();
    // No raw technical error text.
    expect(screen.queryByText(/media_acquire_failed/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue by secure text/i }));
    expect(consult.dismissMediaError).toHaveBeenCalled();
    utils.restore();
  });

  it("store-and-forward state shows the offline card with a rejoin action", async () => {
    const consult = makeConsult({
      state: { status: "store_and_forward", mode: "text", error: null, retryAttempt: 5 },
      profile: {
        online: false,
        effectiveType: null,
        downlinkMbps: null,
        rttMs: null,
        saveData: false,
        quality: "offline",
        sampledAt: 0,
      },
    });
    setConsult(consult);
    const user = userEvent.setup();
    const utils = await renderWithProviders(<ConsultationPage />, { navigatorOnLine: false });
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    expect(screen.getByTestId("store-forward")).toBeInTheDocument();
    expect(screen.getByText(/saved securely on this device/i)).toBeInTheDocument();
    // Offline quality is shown as text, not color alone.
    expect(screen.getByText(/connection: no connection/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /try live connection again/i }));
    expect(consult.retry).toHaveBeenCalledTimes(1);
    utils.restore();
  });

  it("reconnecting state renders the bounded-retry message with a text escape", async () => {
    setConsult(
      makeConsult({
        state: { status: "reconnecting", mode: "video", error: null, retryAttempt: 2 },
      })
    );
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    expect(screen.getByText(/trying to reconnect/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue by secure text/i })).toBeInTheDocument();
    utils.restore();
  });

  it("waiting state uses role-appropriate copy", async () => {
    setConsult(
      makeConsult({
        state: { status: "waiting_for_peer", mode: "text", error: null, retryAttempt: 0 },
      })
    );
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));
    expect(screen.getByText(/waiting for your doctor to join/i)).toBeInTheDocument();
    utils.restore();

    const base = makeConsult();
    setConsult(
      makeConsult({
        session: { ...base.session!, role: "clinician" },
        state: { status: "waiting_for_peer", mode: "text", error: null, retryAttempt: 0 },
      })
    );
    const second = await renderWithProviders(<ConsultationPage />);
    await waitFor(() => expect(screen.getByText(/waiting for the patient to join/i)).toBeInTheDocument());
    second.restore();
  });
});

// ── Recommendations + clinician status ────────────────────────────────────

describe("mode suggestions and clinician status", () => {
  it("incoming suggestion renders accept/dismiss wired to the orchestrator", async () => {
    const consult = makeConsult({
      state: { status: "connected_audio", mode: "audio", error: null, retryAttempt: 0 },
      recommendation: { from: "clinician", mode: "video", at: 1 },
    });
    setConsult(consult);
    const user = userEvent.setup();
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    expect(screen.getByTestId("recommendation")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /switch now/i }));
    expect(consult.acceptRecommendation).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /not now/i }));
    expect(consult.dismissRecommendation).toHaveBeenCalledTimes(1);
    utils.restore();
  });

  it("clinician sees connection status line and can send a mode suggestion", async () => {
    const consult = makeConsult({
      session: { ...makeConsult().session!, role: "clinician" },
      state: { status: "connected_audio", mode: "audio", error: null, retryAttempt: 0 },
      peerPresent: true,
    });
    setConsult(consult);
    const user = userEvent.setup();
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    expect(screen.getByTestId("clinician-status")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /suggest video/i }));
    expect(consult.recommendMode).toHaveBeenCalledWith("video");
    utils.restore();
  });

  it("technical details disclosure reveals the machine status", async () => {
    setConsult(
      makeConsult({
        state: { status: "connected_video", mode: "video", error: null, retryAttempt: 0 },
      })
    );
    const user = userEvent.setup();
    const utils = await renderWithProviders(<ConsultationPage />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    await user.click(screen.getByRole("button", { name: /technical details/i }));
    expect(screen.getByTestId("detail-status").textContent).toBe("connected_video");
    utils.restore();
  });
});
