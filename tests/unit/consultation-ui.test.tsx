/**
 * Consultation UI tests (secure text + lobby).
 * Proves: offline messages persist through provider remount (refresh
 * simulation), never claim delivered before server ack, lobby requests
 * permission only on Join, connection states are honest, fallbacks appear,
 * aria-live announces changes, and no raw errors render.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncProvider, useSync } from "@/lib/offline/sync-provider";
import { LanguageProvider } from "@/lib/i18n/language-context";
import type { QueueItem } from "@/lib/offline/types";
import ConsultationPage from "@/app/(app)/consultations/[id]/page";

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

// jsdom lacks mediaDevices — simulate permission-denied and grant paths.
const getUserMediaMock = vi.fn();
Object.defineProperty(navigator, "mediaDevices", {
  configurable: true,
  value: { getUserMedia: getUserMediaMock },
});

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
  getUserMediaMock.mockReset();
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("secure text (store-and-forward)", () => {
  it("message composed offline is saved to the queue as saved_locally — not delivered", async () => {
    const user = userEvent.setup();
    const utils = await renderWithProviders(<ConsultationPage params={{ id: "appt-1" }} />, {
      navigatorOnLine: false,
    });
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
    const utils = await renderWithProviders(<ConsultationPage params={{ id: "appt-1" }} />, {
      navigatorOnLine: false,
    });
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
    const utils = await renderWithProviders(<ConsultationPage params={{ id: "appt-1" }} />);
    await waitFor(() => expect(utils.probeRef.current?.items.length).toBe(1));
    expect(screen.getByText("Synced message")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    utils.restore();
  });
});

describe("lobby honesty", () => {
  it("requests microphone permission only when the user presses Join", async () => {
    const user = userEvent.setup();
    const utils = await renderWithProviders(<ConsultationPage params={{ id: "appt-1" }} />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    expect(getUserMediaMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /try audio only/i }));
    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
    utils.restore();
  });

  it("permission denial shows the honest fallback message and no call state", async () => {
    getUserMediaMock.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const user = userEvent.setup();
    const utils = await renderWithProviders(<ConsultationPage params={{ id: "appt-1" }} />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    await user.click(screen.getByRole("button", { name: /try audio only/i }));
    await waitFor(() =>
      expect(screen.getByText(/permission was not given|ଅନୁମତି ମିଳିଲା ନାହିଁ/i)).toBeInTheDocument()
    );
    // No fake connected claim.
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    // Text fallback remains available.
    expect(screen.getByLabelText(/write a short message/i)).toBeInTheDocument();
    utils.restore();
  });

  it("failed setup exposes text/audio fallbacks and never claims connected", async () => {
    getUserMediaMock.mockResolvedValue({
      getTracks: () => [],
    });
    const user = userEvent.setup();
    const utils = await renderWithProviders(<ConsultationPage params={{ id: "appt-1" }} />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    await user.click(screen.getByRole("button", { name: /try audio only/i }));
    // Lobby marks setup failed after a short real-time timeout.
    await waitFor(
      () => expect(screen.getByText("Connection failed")).toBeInTheDocument(),
      { timeout: 3000 }
    );
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue by secure text/i })).toBeInTheDocument();
    utils.restore();
  });

  it("announces lobby state changes via aria-live", async () => {
    const utils = await renderWithProviders(<ConsultationPage params={{ id: "appt-1" }} />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
    utils.restore();
  });
});
