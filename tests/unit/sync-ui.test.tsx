/**
 * UI tests for the offline sync UI.
 * Verifies truthful sync states, that no raw network/database error text is
 * rendered, accessible labeling, and keyboard operation of the details panel.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncStatus } from "@/components/offline/SyncStatus";
import { SyncProvider, useSync } from "@/lib/offline/sync-provider";
import { LanguageProvider } from "@/lib/i18n/language-context";
import type { QueueItem } from "@/lib/offline/types";

// ─── Harness ─────────────────────────────────────────────────────────────

async function renderWithProviders(
  ui: React.ReactNode,
  opts: { navigatorOnLine?: boolean } = {}
) {
  const original = window.navigator.onLine;
  const originalDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: opts.navigatorOnLine ?? true,
  });

  const probeRef: { current: ReturnType<typeof useSync> | null } = { current: null };
  const rendered = render(
    <SyncProvider>
      <LanguageProvider>
        {ui}
        <captureProbeFactory.Component probeRef={probeRef} />
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
        Object.defineProperty(window.navigator, "onLine", { configurable: true, value: original });
      }
    },
  };
}

// Small indirection so the probe component is stable across renders.
const captureProbeFactory = {
  Component: function ({ probeRef }: { probeRef: { current: ReturnType<typeof useSync> | null } }) {
    probeRef.current = useSync();
    return null;
  },
};

// jsdom has no IndexedDB; the provider falls back through getOfflineStore —
// which uses the IndexedDB driver in a browser. Stub it via vi.mock of storage.
vi.mock("@/lib/offline/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/storage")>();
  return {
    ...actual,
    getOfflineStore: () => memoryStoreSingleton,
  };
});

import { getOfflineStore } from "@/lib/offline/storage";
import type { OfflineStore } from "@/lib/offline/types";

let backing = new Map<string, QueueItem>();
const memoryStoreSingleton: OfflineStore = {
  async getAll() {
    return [...backing.values()].map((i) => structuredClone(i));
  },
  async put(item) {
    backing.set(item.id, structuredClone(item));
  },
  async update(item) {
    backing.set(item.id, structuredClone(item));
  },
  async remove(id) {
    backing.delete(id);
  },
  async countByState(state) {
    return [...backing.values()].filter((i) => i.state === state).length;
  },
  async putBlob(_key: string, _data: Blob) {},
  async getBlob(_key: string) {
    return undefined;
  },
  async removeBlob(_key: string) {},
} as OfflineStore;

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  const now = new Date("2026-01-01T00:00:00Z").toISOString();
  return {
    id: "item-1",
    idempotencyKey: "key-1",
    actionType: "care_request.create",
    payload: {
      kind: "care_request.create",
      language: "en",
      reason: "Need help reading my report",
      contactMethod: "in_app",
      linkedDocumentIds: [],
      clientCreatedAt: now,
    },
    localCreatedAt: now,
    retryCount: 0,
    state: "pending",
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  backing = new Map();
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ───────────────────────────────────────────────────────────────

describe("SyncStatus truthful states", () => {
  it("renders NOTHING when online with an empty queue (healthy = quiet)", async () => {
    const utils = await renderWithProviders(<SyncStatus />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));
    // Polished UX: no status card at all when everything is synchronized.
    expect(screen.queryByText("Synced securely")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    utils.restore();
  });

  it("shows 'Saved on this device' when offline with pending items", async () => {
    backing.set("item-1", makeItem());
    const utils = await renderWithProviders(<SyncStatus />, { navigatorOnLine: false });
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));
    expect(screen.getByText("Saved on this device")).toBeInTheDocument();
    utils.restore();
  });

  it("shows 'Some items need attention' when an item failed and keeps it visible", async () => {
    backing.set("item-1", makeItem({ state: "requires_attention", lastFailureReason: "The service is busy right now" }));
    const utils = await renderWithProviders(<SyncStatus />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));
    expect(screen.getByText("Some items need attention")).toBeInTheDocument();

    // Failed items remain listed and retriable — never silently deleted.
    await userEvent.click(screen.getByRole("button", { name: /1 item needs attention/i }));
    expect(screen.getByText("The service is busy right now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    utils.restore();
  });
});

describe("no raw errors on Home", () => {
  it("never renders raw network/database error text in the sync UI", async () => {
    backing.set("item-1", makeItem({ state: "failed", lastFailureReason: "Connection dropped during delivery" }));
    const utils = await renderWithProviders(
      <div>
        <SyncStatus />
      </div>
    );
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));
    const text = document.body.textContent ?? "";
    for (const forbidden of [
      "Network Error",
      "NETWORK_ERROR",
      "could not create portfolio",
      "23505",
      "relation \"care_requests\" does not exist",
      "Failed to fetch",
      "ECONNRESET",
      "pg_",
    ]) {
      expect(text).not.toContain(forbidden);
    }
    utils.restore();
  });
});

describe("accessibility", () => {
  it("provides a live-region announcement element when a state card is shown", async () => {
    // Offline with pending items renders the "Saved on this device" card,
    // which carries the polite live region for state changes.
    backing.set("item-1", makeItem());
    const utils = await renderWithProviders(<SyncStatus />, { navigatorOnLine: false });
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));
    const statusEl = document.querySelector('[role="status"][aria-live="polite"]');
    expect(statusEl).not.toBeNull();
    utils.restore();
  });

  it("details panel is reachable and operable by keyboard", async () => {
    backing.set("item-1", makeItem({ state: "pending" }));
    const utils = await renderWithProviders(<SyncStatus />, { navigatorOnLine: false });
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    const toggle = screen.getByRole("button", { name: /1 item waiting for connection/i });
    toggle.focus();
    expect(toggle).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("Request care support")).toBeInTheDocument();
    utils.restore();
  });

  it("remove action requires an explicit confirmation step", async () => {
    backing.set("item-1", makeItem({ state: "pending" }));
    const utils = await renderWithProviders(<SyncStatus />, { navigatorOnLine: false });
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    await userEvent.click(screen.getByRole("button", { name: /1 item waiting/i }));
    await userEvent.click(screen.getByRole("button", { name: "Remove local draft" }));
    expect(screen.getByText("Remove this saved item?")).toBeInTheDocument();
    // Not removed until the user confirms.
    expect(screen.getByRole("button", { name: "Yes, remove it" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep it" })).toBeInTheDocument();
    utils.restore();
  });
});
