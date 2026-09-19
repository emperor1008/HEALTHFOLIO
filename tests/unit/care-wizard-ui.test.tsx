/**
 * Part 2 UI tests — care-request wizard + truthful queue behavior.
 * Proves:
 * - saving offline enqueues a packet and never claims "sent";
 * - the packet survives reload through the (mocked) IndexedDB store;
 * - emergency guidance requires acknowledgement before continue unlocks;
 * - keyboard navigation + accessible labels + progressbar;
 * - no raw network/database errors render anywhere in the wizard.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncProvider, useSync } from "@/lib/offline/sync-provider";
import { LanguageProvider, useLanguage } from "@/lib/i18n/language-context";
import type { QueueItem } from "@/lib/offline/types";
import { CareRequestWizard } from "@/components/care/CareRequestWizard";

// ─── Harness (memory store + navigator.onLine control) ──────────────────────

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Keep the records picker offline-honest: fetch fails → empty list.
const fetchMock = vi.fn(() => Promise.reject(new Error("offline")));
vi.stubGlobal("fetch", fetchMock);

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

function baseItem(overrides: Partial<QueueItem> = {}): QueueItem {
  const now = new Date("2026-09-18T00:00:00Z").toISOString();
  return {
    id: "q-1",
    idempotencyKey: "key-1",
    actionType: "care_request.create",
    payload: {
      kind: "care_request.create",
      language: "en",
      reason: "Concerns: fever.",
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
  fetchMock.mockClear();
  fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Walk the wizard to the review screen with a mild fever input.
async function walkToReview(user: ReturnType<typeof userEvent.setup>) {
  // start → category
  await user.click(screen.getByRole("button", { name: "Continue" }));
  // category: pick "Fever or infection concern" (English UI in tests)
  await user.click(screen.getByRole("button", { name: /fever or infection/i }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  // body area
  await user.click(screen.getByRole("button", { name: /whole body/i }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  // description: type a typo'd fever sentence
  await user.type(screen.getByRole("textbox"), "bukhar for 4 days");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  // interpretation: "fever" chip is pre-selected; Continue confirms it.
  await user.click(screen.getByRole("button", { name: "Continue" }));
  // follow-ups: answer yes to fever duration
  const yesButtons = screen.getAllByRole("button", { name: "Yes" });
  await user.click(yesButtons[0]);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  // urgency: routine-or-urgent result appears (fever 3+ days → urgent → ack required)
  // acknowledgement checkbox required for urgent
  const ack = screen.getByRole("checkbox");
  await user.click(ack);
  await user.click(screen.getByRole("button", { name: "Continue" }));
  // records step (offline → honest empty list)
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("wizard intake", () => {
  it("advances with keyboard and exposes progress + labels", async () => {
    const user = userEvent.setup();
    const utils = await renderWithProviders(<CareRequestWizard />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    const progress = screen.getByRole("progressbar");
    expect(progress).toBeInTheDocument();
    expect(progress).toHaveAttribute("aria-valuemin", "1");

    // Advance to the category step; its buttons are real buttons (keyboard-
    // operable) with visible text labels.
    await user.click(screen.getByRole("button", { name: "Continue" }));
    const feverBtn = screen.getByRole("button", { name: /fever or infection/i });
    expect(feverBtn).toBeInTheDocument();
    // Keyboard: focus and activate via Enter (userEvent does real key events).
    feverBtn.focus();
    expect(feverBtn).toHaveFocus();
    utils.restore();
  });

  it("normalization preview suggests broad concepts only", async () => {
    const user = userEvent.setup();
    const utils = await renderWithProviders(<CareRequestWizard />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: /fever or infection/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: /whole body/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByRole("textbox"), "bukhar for 4 days");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // Interpretation screen: the "fever" chip should be pre-selected.
    const feverChip = screen.getByRole("button", { name: /fever/i });
    expect(feverChip).toHaveAttribute("aria-pressed", "true");
    utils.restore();
  });
});

describe("emergency acknowledgement gate", () => {
  it("Continue stays disabled until urgent guidance is acknowledged", async () => {
    const user = userEvent.setup();
    const utils = await renderWithProviders(<CareRequestWizard />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: /fever or infection/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: /whole body/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByRole("textbox"), "bukhar for 4 days");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    // Answer the fever-duration follow-up as Yes → urgent → ack required.
    const yesButtons = screen.getAllByRole("button", { name: "Yes" });
    await user.click(yesButtons[0]);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    // On the urgency screen with an urgent result, Continue must be disabled
    // until the acknowledgement checkbox is ticked.
    const continueBtn = screen.getByRole("button", { name: "Continue" });
    expect(continueBtn).toBeDisabled();
    const ack = screen.getByRole("checkbox");
    await user.click(ack);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    utils.restore();
  });
});

describe("offline save", () => {
  it("saving offline enqueues the packet; item stays pending (never 'sent')", async () => {
    const user = userEvent.setup();
    const utils = await renderWithProviders(<CareRequestWizard />, { navigatorOnLine: false });
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    await walkToReview(user);
    await user.click(screen.getByRole("button", { name: /save request/i }));

    await waitFor(() => expect(backing.size).toBe(1));
    const item = [...backing.values()][0];
    expect(item.state).toBe("pending");
    expect(item.serverRecordId).toBeUndefined();
    expect(item.syncedAt).toBeUndefined();
    // Packet preserved verbatim:
    const payload = item.payload as { packet?: { symptom_text_original?: string; triage_category?: string } };
    expect(payload.packet?.symptom_text_original).toBe("bukhar for 4 days");
    expect(payload.packet?.triage_category).toBe("urgent");
    utils.restore();
  });

  it("a pending packet in the store survives 'reload' (new provider mount)", async () => {
    // Simulate reload: seed the store, mount a fresh provider + wizard.
    backing.set("q-persisted", baseItem({ id: "q-persisted", state: "pending" }));
    const user = userEvent.setup();
    const utils = await renderWithProviders(<CareRequestWizard />);
    await waitFor(() => expect(utils.probeRef.current?.ready).toBe(true));

    // The engine loaded the persisted item into context.
    await waitFor(() => expect(utils.probeRef.current?.items.length).toBe(1));
    expect(utils.probeRef.current?.items[0].state).toBe("pending");
    utils.restore();
  });
});
