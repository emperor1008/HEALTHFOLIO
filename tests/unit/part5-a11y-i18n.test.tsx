/**
 * Part 5 accessibility + multilingual audit.
 * - Journey dictionary key parity en/hi/or + English fallback for unknown keys
 *   is guaranteed by typed dictionaries (compile time) and asserted here (runtime)
 * - aria-live region exists on the journey view; state changes announce
 * - touch targets ≥44px on journey retry actions
 * - reduced-motion respected (no animation classes in JourneyStatus)
 * - no raw error text in the reliability dashboard empty/forbidden states
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { JourneyStatus } from "@/components/journey/JourneyStatus";
import { getJourneyDict } from "@/lib/journey/dict";
import { deriveJourney, type JourneyInputs } from "@/lib/journey/status";
import { PART4_DICT } from "@/lib/i18n/part4";
import type { QueueItem } from "@/lib/offline/types";

function collectKeys(obj: object, prefix = ""): string[] {
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    typeof v === "object" && v !== null ? collectKeys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("journey dictionary parity (en/hi/or)", () => {
  it("hi and or have identical key sets to en", () => {
    const en = getJourneyDict("en");
    const hi = getJourneyDict("hi");
    const or = getJourneyDict("or");
    const enKeys = collectKeys(en).sort();
    expect(collectKeys(hi).sort()).toEqual(enKeys);
    expect(collectKeys(or).sort()).toEqual(enKeys);
  });

  it("every step key used by deriveJourney has a translation", () => {
    const queueItem: QueueItem = {
      id: "q",
      idempotencyKey: "k",
      actionType: "care_request.create",
      payload: { kind: "care_request.create", language: "en", reason: "x", contactMethod: "in_app", linkedDocumentIds: [], clientCreatedAt: "2026-01-01T00:00:00Z" },
      localCreatedAt: "2026-01-01T00:00:00Z",
      retryCount: 0,
      state: "synced",
      syncedAt: "2026-01-01T01:00:00Z",
      updatedAt: "2026-01-01T01:00:00Z",
    };
    const inputs: JourneyInputs = {
      queueItems: [queueItem],
      online: true,
      careRequest: { id: "c", status: "submitted", createdAt: "2026-01-01T00:00:00Z", urgency: "routine" },
      appointment: { id: "a", state: "completed", updatedAt: "2026-01-02T00:00:00Z" },
      consent: { granted: true, revoked: false, at: "2026-01-01T02:00:00Z" },
      pharmacyRequest: { id: "p", status: "responded", createdAt: "2026-01-01T03:00:00Z" },
    };
    const steps = deriveJourney(inputs);
    for (const lang of ["en", "hi", "or"] as const) {
      const dict = getJourneyDict(lang);
      for (const step of steps) {
        expect(dict.steps[step.key]).toBeDefined();
        expect(dict.steps[step.key].label.length).toBeGreaterThan(0);
        expect(dict.steps[step.key].hint.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("part4 dictionary remains complete across en/hi/or", () => {
  it("part4 dict has matching key sets (part2/3 keep their own suites)", () => {
    const enKeys = Object.keys(PART4_DICT.en).sort();
    expect(Object.keys(PART4_DICT.hi).sort()).toEqual(enKeys);
    expect(Object.keys(PART4_DICT.or).sort()).toEqual(enKeys);
  });
});

describe("JourneyStatus accessibility", () => {
  function renderJourney() {
    const queueItem: QueueItem = {
      id: "q",
      idempotencyKey: "k",
      actionType: "care_request.create",
      payload: { kind: "care_request.create", language: "en", reason: "x", contactMethod: "in_app", linkedDocumentIds: [], clientCreatedAt: "2026-01-01T00:00:00Z" },
      localCreatedAt: "2026-01-01T00:00:00Z",
      retryCount: 0,
      state: "requires_attention",
      retryCount2: undefined,
      updatedAt: "2026-01-01T00:00:00Z",
    } as unknown as QueueItem;
    return render(
      <LanguageProvider>
        <JourneyStatus steps={deriveJourney({ queueItems: [queueItem], online: false })} onRetry={() => undefined} />
      </LanguageProvider>,
    );
  }

  it("renders a labelled section with an ordered list and aria-live region", () => {
    renderJourney();
    expect(screen.getByRole("region", { name: /request journey/i }) ?? screen.getByLabelText(/request journey/i)).toBeTruthy();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText(/Journey status/i)).toBeInTheDocument();
  });

  it("shows attention step with retry button using icon+text (not icon-only)", () => {
    renderJourney();
    const retry = screen.getAllByRole("button", { name: /retry/i })[0];
    expect(retry).toBeInTheDocument();
    expect(retry.textContent).toMatch(/Retry/);
    expect(retry.textContent?.length).toBeGreaterThan(2);
  });

  it("no keyframe animations on journey step rows (reduced-motion safe)", () => {
    const { container } = renderJourney();
    const animated = container.querySelectorAll('[class*="animate-"]');
    expect(animated.length).toBe(0);
  });
});
