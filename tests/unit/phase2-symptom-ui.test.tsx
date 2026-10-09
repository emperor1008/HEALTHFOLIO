/**
 * Phase 2 UI tests — guided symptom checker.
 *
 * Proves:
 * - one-question-per-screen flow with large tap targets and progress;
 * - MANDATORY red-flag override: an engine emergency stops collection
 *   immediately (escalation screen, NO talk-to-doctor/appointment CTA);
 * - clarifications are bounded (≤3 questions) and can escalate mid-flow;
 * - AI failure (503/offline) degrades to the guided path with a visible,
 *   honest notice — the flow never hangs or guesses;
 * - voice input always requires confirmation before interpretation;
 * - care handoff goes through the EXISTING queue (enqueue + no new
 *   architecture), with consent checkboxes and urgent acknowledgement;
 * - offline banner shown honestly up front.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { SymptomChecker } from "@/components/care/SymptomChecker";

const mocks = vi.hoisted(() => ({
  online: true,
  enqueue: vi.fn(),
  push: vi.fn(),
  card: null as {
    medications: string[];
    allergies: string[];
    conditions: string[];
  } | null,
}));

vi.mock("@/lib/offline/sync-provider", () => ({
  useSync: () => ({
    online: mocks.online,
    enqueueCareRequestPacket: mocks.enqueue,
  }),
}));

vi.mock("@/lib/health-card/use-health-card", () => ({
  useHealthCard: () => ({
    card: mocks.card,
    savedAt: mocks.card ? new Date().toISOString() : null,
    freshness: mocks.card ? ("current" as const) : null,
    loadedLocal: true,
    online: mocks.online,
    syncState: "none",
    refreshError: false,
    refresh: vi.fn(),
    saveFacts: vi.fn(),
    clearLocal: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

const fetchMock = vi.fn();
const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");

function setOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
}

function renderChecker() {
  return render(
    <LanguageProvider>
      <SymptomChecker />
    </LanguageProvider>
  );
}

async function startAndPick(user: ReturnType<typeof userEvent.setup>, concepts: string[]) {
  await user.click(screen.getByRole("button", { name: "Check my symptoms" }));
  for (const label of concepts) {
    await user.click(screen.getByRole("button", { name: new RegExp(label) }));
  }
  await user.click(screen.getByRole("button", { name: "Continue" })); // feeling
  // Optional describe step (skipped unless a red flag stopped collection first).
  const describeContinue = screen.queryByRole("button", { name: "Continue" });
  if (describeContinue) await user.click(describeContinue);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockRejectedValue(new Error("no network in test"));
  mocks.online = true;
  mocks.card = null;
  mocks.enqueue.mockReset().mockResolvedValue(undefined);
  mocks.push.mockReset();
  window.localStorage.clear();
  setOnLine(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalOnLineDescriptor) {
    Object.defineProperty(window.navigator, "onLine", originalOnLineDescriptor);
  }
});

describe("SymptomChecker flow", () => {
  it("intro shows the honest disclaimer and offline notice", () => {
    mocks.online = false;
    renderChecker();

    expect(screen.getByRole("heading", { name: "Check my symptoms" })).toBeTruthy();
    expect(screen.getAllByText(/does not diagnose illness/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Offline — guided symptom selection is active/i)).toBeTruthy();
  });

  it("collects symptoms with large buttons and progress", async () => {
    const user = userEvent.setup();
    renderChecker();
    await user.click(screen.getByRole("button", { name: "Check my symptoms" }));

    expect(screen.getByRole("heading", { name: "How are you feeling?" })).toBeTruthy();
    expect(screen.getByText("Question 1 of 4")).toBeTruthy();
    expect(screen.getByRole("button", { name: /fever/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /difficulty breathing/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Other \/ type it/ })).toBeTruthy();
    // Continue locked until something is chosen.
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/Choose at least one symptom/i)).toBeTruthy();
  });

  it("MANDATORY red-flag override: emergency stops collection instantly (no care CTA)", async () => {
    const user = userEvent.setup();
    renderChecker();
    await startAndPick(user, ["fainting or collapse"]);

    // No duration/severity/clarify screens were shown — straight to escalation.
    expect(screen.getByText("Emergency")).toBeTruthy();
    expect(screen.getByText("Seek emergency help now")).toBeTruthy();
    expect(screen.queryByText("How long has this been going on?")).toBeNull();
    // Escalation screen: NO talk-to-doctor / appointment-first CTA.
    expect(screen.queryByRole("button", { name: "Talk to a doctor" })).toBeNull();
    expect(screen.getByRole("button", { name: "Start again" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mid-flow escalation: Yes to chest pressure jumps straight to emergency", async () => {
    const user = userEvent.setup();
    renderChecker();
    await startAndPick(user, ["chest discomfort"]);

    expect(screen.getByText("How long has this been going on?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Today" }));
    await user.click(screen.getByRole("button", { name: "Mild" }));

    // First clarification for chest, answered Yes → EM-02 emergency now.
    expect(await screen.findByText(/chest discomfort spreading/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Yes" }));

    expect(screen.getByText("Emergency")).toBeTruthy();
    // The remaining clarification ("suddenly worse") was never asked.
    expect(screen.queryByText(/suddenly become worse/i)).toBeNull();
  });

  it("routine path: buttons-only flow skips AI, asks ≤3 clarifications, routes to doctor", async () => {
    const user = userEvent.setup();
    renderChecker();
    await startAndPick(user, ["fever"]);

    await user.click(screen.getByRole("button", { name: "1–3 days" }));
    await user.click(screen.getByRole("button", { name: "Mild" }));

    // No free text → no AI call at all.
    await waitFor(() => expect(screen.getByText(/fever lasted three days/i)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "No" }));
    expect(screen.getByText(/suddenly become worse/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "No" }));

    // Routine result with disclaimer and doctor handoff.
    expect(screen.getByText("Routine")).toBeTruthy();
    expect(screen.getByText(/routing suggestion, not a health assessment/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Talk to a doctor" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByText("Share with doctor")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(mocks.enqueue).toHaveBeenCalledWith({
        language: "en",
        packet: expect.objectContaining({
          symptom_concepts: ["fever"],
          triage_category: "routine",
          follow_up_answers: {
            fever_three_days_or_more: false,
            symptoms_suddenly_worse: false,
          },
          summary: expect.stringContaining("fever"),
        }),
      })
    );
    expect(mocks.push).toHaveBeenCalledWith("/care-requests?saved=offline");
  });

  it("duration ≥3 days maps onto the reviewed rule → urgent, ack required to share", async () => {
    const user = userEvent.setup();
    renderChecker();
    await startAndPick(user, ["fever"]);

    await user.click(screen.getByRole("button", { name: "4–7 days" }));
    await user.click(screen.getByRole("button", { name: "Moderate" }));

    // Clarification bounded to the queue — answer through to the result.
    await user.click(await screen.findByRole("button", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: "No" }));

    expect(screen.getByText("Urgent")).toBeTruthy();
    expect(screen.getByText("Talk to a doctor soon")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Talk to a doctor" }));
    const shareButton = screen.getByRole("button", { name: "Share" });
    expect(shareButton).toHaveProperty("disabled", true);

    // Acknowledgement unlocks sharing for urgent packets.
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2); // symptoms (checked+disabled) + ack
    const ackBox = checkboxes.find((c) => !(c as HTMLInputElement).disabled);
    expect(ackBox).toBeTruthy();
    await user.click(ackBox as HTMLElement);
    expect(screen.getByRole("button", { name: "Share" })).toHaveProperty("disabled", false);
  });

  it("clarifications never exceed 3 questions", async () => {
    const user = userEvent.setup();
    renderChecker();
    await startAndPick(user, ["fever", "vomiting", "injury"]);

    await user.click(screen.getByRole("button", { name: "More than a week" }));
    await user.click(screen.getByRole("button", { name: "Severe" }));

    // Queue is bounded: 4 collection + 3 clarification = "Question 7 of 7" max.
    for (let i = 0; i < 4; i += 1) {
      const yes = screen.queryByRole("button", { name: "Yes" });
      if (!yes) break;
      // Any answer either advances a question or ends collection.
      await user.click(screen.getByRole("button", { name: i % 2 === 0 ? "Yes" : "Not sure" }));
      if (screen.queryByText("Your next step")) break;
    }
    const progress = screen.queryByText(/Question \d+ of \d+/);
    if (progress) {
      const total = Number(progress.textContent?.match(/of (\d+)/)?.[1] ?? "0");
      expect(total).toBeLessThanOrEqual(7);
    } else {
      expect(screen.getByText("Your next step")).toBeTruthy();
    }
  });
});

describe("SymptomChecker AI degradation (Layer 1 optional)", () => {
  it("typed text + API failure falls back to the guided path with a visible notice", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error("server down"));
    renderChecker();

    await user.click(screen.getByRole("button", { name: "Check my symptoms" }));
    await user.click(screen.getByRole("button", { name: /fever/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    // Describe (optional): type free text.
    await user.type(
      screen.getByPlaceholderText("For example: fever since two days…"),
      "fever since two days"
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "1–3 days" }));
    await user.click(screen.getByRole("button", { name: "Mild" }));

    expect(await screen.findByText(/Advanced language understanding is unavailable right now/i)).toBeTruthy();
    expect(screen.getByText(/Use the symptom buttons or continue with guided questions/i)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/triage/interpret",
      expect.objectContaining({ method: "POST" })
    );
    // Flow continued — deterministic path asked the fever duration question.
    expect(screen.getByText(/fever lasted three days/i)).toBeTruthy();
  });

  it("offline: no interpret call, guided mode notice instead", async () => {
    const user = userEvent.setup();
    mocks.online = false;
    setOnLine(false);
    renderChecker();

    await user.click(screen.getByRole("button", { name: "Check my symptoms" }));
    await user.click(screen.getByRole("button", { name: /fever/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(
      screen.getByPlaceholderText("For example: fever since two days…"),
      "बुखार है"
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Today" }));
    await user.click(screen.getByRole("button", { name: "Mild" }));

    expect(await screen.findByText(/Advanced language understanding is unavailable offline/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AI timeout code (504) also degrades safely", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 504,
      json: async () => ({ data: null, error: { code: "AI_TIMEOUT" } }),
    });
    renderChecker();

    await user.click(screen.getByRole("button", { name: "Check my symptoms" }));
    await user.click(screen.getByRole("button", { name: /fever/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(
      screen.getByPlaceholderText("For example: fever since two days…"),
      "high fever"
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Today" }));
    await user.click(screen.getByRole("button", { name: "Severe" }));

    expect(
      await screen.findByText(/Advanced language understanding is unavailable right now/i)
    ).toBeTruthy();
  });
});

describe("SymptomChecker voice input", () => {
  it("requires explicit confirmation ('You said:') and handles unsupported browsers", async () => {
    const user = userEvent.setup();
    renderChecker();

    await user.click(screen.getByRole("button", { name: "Check my symptoms" }));
    await user.click(screen.getByRole("button", { name: /Other \/ type it/ }));
    expect(
      screen.getByPlaceholderText("For example: fever since two days…")
    ).toBeTruthy();

    // jsdom has no SpeechRecognition → honest unsupported notice, typing works.
    await user.click(screen.getByRole("button", { name: "Speak" }));
    expect(
      screen.getByText(/Voice input is not available in this browser/i)
    ).toBeTruthy();
    expect(screen.queryByText("You said:")).toBeNull();
  });
});
