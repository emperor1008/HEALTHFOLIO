/**
 * Phase 2 — Layer 1 AI interpretation wrapper + POST /api/triage/interpret.
 *
 * Wrapper safety contract:
 *   - never throws; every failure collapses to AI_UNAVAILABLE / AI_TIMEOUT /
 *     AI_INVALID_RESPONSE;
 *   - bounded deadline (slow provider → AI_TIMEOUT, flow falls back);
 *   - strict schema validation; unknown concept/follow-up ids dropped;
 *   - prompt forbids diagnosis and sends only canonical ids + ≤500 chars.
 *
 * Route contract:
 *   - 401 without a session, 400 on invalid body;
 *   - structured failure codes (503/504/502) the client tolerates;
 *   - deterministic normalizer always merged in (AI can add, never remove);
 *   - no urgency/diagnosis field in the response, no symptom text in logs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const providerState = vi.hoisted(() => ({
  configured: true,
  call: vi.fn(),
}));

vi.mock("@/lib/ai/provider", () => ({
  getAIProvider: () => ({
    isConfigured: () => providerState.configured,
    callStructuredChat: (...args: unknown[]) => providerState.call(...args),
  }),
}));

const getUserMock = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({ getUser: () => getUserMock() }));

import {
  interpretSymptomsWithAI,
  buildSymptomInterpretationMessages,
  AI_INTERPRET_MAX_TEXT,
  AI_INTERPRET_TIMEOUT_MS,
} from "@/lib/triage/ai-interpret";
import { POST as interpretPOST } from "@/app/api/triage/interpret/route";

function validModelPayload(overrides: Record<string, unknown> = {}) {
  return {
    concepts: [{ id: "fever", confidence: 0.9 }],
    duration: { value: 2, unit: "days" },
    severity: "moderate",
    suggestedFollowUpId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  providerState.configured = true;
  providerState.call.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── interpretSymptomsWithAI (wrapper) ─────────────────────────────────────

describe("interpretSymptomsWithAI", () => {
  it("returns AI_UNAVAILABLE without calling the provider when unconfigured", async () => {
    providerState.configured = false;
    const res = await interpretSymptomsWithAI({ language: "en", text: "fever" });
    expect(res).toEqual({ ok: false, reason: "AI_UNAVAILABLE" });
    expect(providerState.call).not.toHaveBeenCalled();
  });

  it("returns sanitized concepts and drops unknown ids", async () => {
    providerState.call.mockResolvedValue(
      validModelPayload({
        concepts: [
          { id: "fever", confidence: 0.9 },
          { id: "malaria", confidence: 0.8 },
          { id: "fever", confidence: 0.5 },
        ],
        suggestedFollowUpId: "not_a_reviewed_id",
      })
    );

    const res = await interpretSymptomsWithAI({ language: "hi", text: "बुखार" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.interpretation.concepts).toEqual(["fever"]);
      expect(res.interpretation.droppedConcepts).toEqual(["malaria"]);
      expect(res.interpretation.suggestedFollowUpId).toBeNull();
      expect(res.interpretation.droppedFollowUp).toBe(true);
      expect(res.interpretation.severity).toBe("moderate");
      expect(res.interpretation.duration).toEqual({ value: 2, unit: "days" });
    }
  });

  it("maps provider AI_TIMEOUT errors to AI_TIMEOUT", async () => {
    providerState.call.mockRejectedValue(new Error("AI_TIMEOUT"));
    const res = await interpretSymptomsWithAI({ language: "en", text: "chest pain" });
    expect(res).toEqual({ ok: false, reason: "AI_TIMEOUT" });
  });

  it("maps ZodError (schema mismatch) to AI_INVALID_RESPONSE", async () => {
    providerState.call.mockRejectedValue(new (class extends Error {
      constructor() { super("schema"); this.name = "ZodError"; }
    })());
    const res = await interpretSymptomsWithAI({ language: "en", text: "chest pain" });
    expect(res).toEqual({ ok: false, reason: "AI_INVALID_RESPONSE" });
  });

  it("treats a payload failing the strict schema as AI_INVALID_RESPONSE", async () => {
    providerState.call.mockResolvedValue({ concepts: "not-an-array" });
    const res = await interpretSymptomsWithAI({ language: "en", text: "fever" });
    expect(res).toEqual({ ok: false, reason: "AI_INVALID_RESPONSE" });
  });

  it("maps unknown provider failures (network, stub) to AI_UNAVAILABLE", async () => {
    providerState.call.mockRejectedValue(
      new Error("AI configuration required. Set AI_PROVIDER…")
    );
    const res = await interpretSymptomsWithAI({ language: "en", text: "fever" });
    expect(res).toEqual({ ok: false, reason: "AI_UNAVAILABLE" });
  });

  it("enforces the bounded deadline on a hanging provider", async () => {
    vi.useFakeTimers();
    providerState.call.mockReturnValue(new Promise(() => {})); // never settles

    const pending = interpretSymptomsWithAI({ language: "en", text: "fever" });
    await vi.advanceTimersByTimeAsync(AI_INTERPRET_TIMEOUT_MS + 100);
    const res = await pending;

    expect(res).toEqual({ ok: false, reason: "AI_TIMEOUT" });
  });

  it("never includes the raw symptom text in a failure result", async () => {
    providerState.call.mockRejectedValue(new Error("boom: very secret words"));
    const res = await interpretSymptomsWithAI({
      language: "en",
      text: "very secret words",
    });
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).not.toContain("secret");
  });
});

describe("buildSymptomInterpretationMessages", () => {
  it("forbids diagnosis and pins the closed concept/follow-up vocabularies", () => {
    const [system, user] = buildSymptomInterpretationMessages({
      language: "or",
      text: "ଜ୍ୱର ଅଛି",
    });

    expect(system.role).toBe("system");
    expect(system.content).toContain("do NOT diagnose");
    expect(system.content).toContain("do NOT suggest medicines");
    expect(system.content).toContain("chest_discomfort");
    expect(system.content).toContain("difficulty_breathing");
    expect(system.content).toContain("fever_three_days_or_more");
    expect(system.content).toContain("untrusted data");
    expect(user.content).toContain("Language: or");
    expect(user.content).toContain("ଜ୍ୱର ଅଛି");
  });

  it("truncates symptom text to the low-bandwidth cap", () => {
    const longText = `${"a".repeat(440)}MARKER_TAIL_${"b".repeat(300)}`;
    const [, user] = buildSymptomInterpretationMessages({
      language: "en",
      text: longText,
    });
    const words = user.content.split("Patient's words: ")[1];

    expect(words).toHaveLength(AI_INTERPRET_MAX_TEXT);
    expect(words).toContain("MARKER_TAIL"); // head survives (marker at char 400)
    expect(words).not.toContain("b".repeat(50));
  });
});

// ── POST /api/triage/interpret (route) ────────────────────────────────────

function post(body: unknown) {
  return interpretPOST(
    new Request("http://localhost/api/triage/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

const VALID_BODY = { language: "hi", text: "बुखार और उल्टी" };

describe("POST /api/triage/interpret", () => {
  it("401 without a session", async () => {
    getUserMock.mockResolvedValue(null);
    const res = await post(VALID_BODY);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("AUTH_REQUIRED");
    expect(json.data).toBeNull();
  });

  it("400 on malformed JSON", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("400 on missing/empty/oversized text or a bad language", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });

    for (const bad of [
      { language: "hi", text: "" },
      { language: "xx", text: "fever" },
      { language: "hi", text: "c".repeat(501) },
      { text: "fever" },
    ]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_REQUEST");
    }
  });

  it("503 AI_UNAVAILABLE when the provider is not configured", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    providerState.configured = false;

    const res = await post(VALID_BODY);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.data).toBeNull();
    expect(json.error.code).toBe("AI_UNAVAILABLE");
    expect(typeof json.requestId).toBe("string");
  });

  it("504 AI_TIMEOUT when the provider times out", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    providerState.call.mockRejectedValue(new Error("AI_TIMEOUT"));

    const res = await post(VALID_BODY);
    expect(res.status).toBe(504);
    expect((await res.json()).error.code).toBe("AI_TIMEOUT");
  });

  it("502 AI_INVALID_RESPONSE when the model payload fails the schema", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    providerState.call.mockResolvedValue({ totally: "wrong" });

    const res = await post(VALID_BODY);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("AI_INVALID_RESPONSE");
  });

  it("merges deterministic + AI concepts and drops unknown AI ids", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    providerState.call.mockResolvedValue(
      validModelPayload({
        concepts: [
          { id: "vomiting", confidence: 0.9 },
          { id: "dengue", confidence: 0.7 },
        ],
      })
    );

    const res = await post(VALID_BODY);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.error).toBeNull();
    // "बुखार" is recognized deterministically → fever; AI added vomiting.
    expect(json.data.concepts).toContain("fever");
    expect(json.data.concepts).toContain("vomiting");
    expect(json.data.concepts).not.toContain("dengue");
    expect(json.data.uncertain).toBe(false);
    expect(json.data.droppedConcepts).toEqual(["dengue"]);
    expect(json.data.duration).toEqual({ value: 2, unit: "days" });
    expect(json.data.severity).toBe("moderate");
    // No triage/diagnosis output — that is the deterministic engine's job.
    expect(json.data.urgency).toBeUndefined();
    expect(json.data.diagnosis).toBeUndefined();
  });

  it("adds explicitly confirmed concepts but never non-canonical ones", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    providerState.call.mockResolvedValue(validModelPayload({ concepts: [] }));

    const res = await post({
      ...VALID_BODY,
      text: "qxz nothing recognizable",
      concepts: ["difficulty_breathing", "made_up_concept"],
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.concepts).toEqual(["difficulty_breathing"]);
  });

  it("reports uncertain when nothing can be understood", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    providerState.call.mockResolvedValue(validModelPayload({ concepts: [] }));

    const res = await post({ language: "en", text: "qxz nothing recognizable" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.concepts).toEqual([]);
    expect(json.data.uncertain).toBe(true);
  });

  it("never writes the raw symptom text to the console", async () => {
    getUserMock.mockResolvedValue({ id: "u1", email: "" });
    providerState.call.mockResolvedValue(validModelPayload());

    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {})
    );

    const marker = "MARKER_UNIQUE_SYMPTOM_PHRASE";
    const ok = await post({ language: "en", text: `fever ${marker}` });
    providerState.call.mockRejectedValue(new Error("down"));
    const fail = await post({ language: "en", text: `fever ${marker}` });

    expect(ok.status).toBe(200);
    expect(fail.status).toBe(503);

    const logged = spies
      .flatMap((s) => s.mock.calls)
      .map((args) => JSON.stringify(args))
      .join(" ");
    expect(logged).not.toContain(marker);
    for (const s of spies) s.mockRestore();
  });
});
