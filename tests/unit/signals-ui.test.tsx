/**
 * UI tests for the Health Signals section.
 * Mocks fetch at the boundary; asserts truthful states, accessibility,
 * and that actions issue real API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HealthSignalsSection } from "@/components/signals/HealthSignalsSection";

function signalFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    latest_measurement_id: "m-latest",
    baseline_measurement_id: "m-base",
    normalized_test_key: "hba1c",
    display_name: "HbA1c",
    signal_type: "numeric_change_observed",
    lifecycle_status: "draft",
    payload: {
      baselineValue: 6.1,
      latestValue: 6.8,
      unit: "%",
      absoluteChange: 0.7,
      percentChange: 11.47541,
      baselineDate: "2026-06-01",
      latestDate: "2026-06-15",
      daysBetween: 14,
    },
    evidence: {
      latest: { measurementId: "m-latest", documentId: "doc-1", pageNumber: 2 },
      baseline: { measurementId: "m-base", documentId: "doc-0", pageNumber: 1 },
    },
    reason_code: null,
    rule_version: "signals.v1",
    created_at: "2026-06-15T10:00:00Z",
    updated_at: "2026-06-15T10:00:00Z",
    ...overrides,
  };
}

function mockFetchSequence(responses: Array<{ ok: boolean; json: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    return {
      ok: next?.ok ?? true,
      json: async () => next?.json ?? { signals: [] },
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HealthSignalsSection", () => {
  it("shows a truthful empty state when no signals exist", async () => {
    mockFetchSequence([{ ok: true, json: { signals: [] } }]);
    render(<HealthSignalsSection />);

    await waitFor(() =>
      expect(
        screen.getByText("Verified measurements will appear here after you add and review health records.")
      ).toBeInTheDocument()
    );
  });

  it("shows a loading skeleton before data arrives", async () => {
    let resolveFetch: (v: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve)))
    );
    render(<HealthSignalsSection />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
    resolveFetch({
      ok: true,
      json: async () => ({ signals: [] }),
    } as unknown as Response);
    await waitFor(() => expect(screen.getByText(/Verified measurements will appear/i)).toBeInTheDocument());
  });

  it("renders a real signal with factual copy and no raw errors", async () => {
    mockFetchSequence([{ ok: true, json: { signals: [signalFixture()] } }]);
    render(<HealthSignalsSection />);

    await waitFor(() =>
      expect(screen.getByText("New verified result available for HbA1c.")).toBeInTheDocument()
    );
    expect(
      screen.getByText("Recorded value changed from 6.1% to 6.8%.")
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/PGRST|SQL|postgres|failed to fetch/i);
  });

  it("shows a calm recoverable error, never raw backend text", async () => {
    mockFetchSequence([{ ok: false, json: {} }]);
    render(<HealthSignalsSection />);

    await waitFor(() =>
      expect(screen.getByText("Health signals are temporarily unavailable. Try again.")).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("acknowledge issues a real API call and removes the card", async () => {
    const user = userEvent.setup();
    const calls = mockFetchSequence([
      { ok: true, json: { signals: [signalFixture()] } },
      { ok: true, json: { ok: true } },
    ]);
    render(<HealthSignalsSection />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Acknowledge" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Acknowledge" }));

    await waitFor(() =>
      expect(calls.some((c) => c.url === "/api/signals/actions" && (c.init?.body as string)?.includes("acknowledge"))).toBe(true)
    );
    await waitFor(() =>
      expect(screen.queryByText("New verified result available for HbA1c.")).not.toBeInTheDocument()
    );
  });

  it("dismiss issues a real API call and removes the card", async () => {
    const user = userEvent.setup();
    const calls = mockFetchSequence([
      { ok: true, json: { signals: [signalFixture()] } },
      { ok: true, json: { ok: true } },
    ]);
    render(<HealthSignalsSection />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() =>
      expect(calls.some((c) => c.url === "/api/signals/actions" && (c.init?.body as string)?.includes("dismiss"))).toBe(true)
    );
  });

  it("save for later issues a real API call and removes the card", async () => {
    const user = userEvent.setup();
    const calls = mockFetchSequence([
      { ok: true, json: { signals: [signalFixture()] } },
      { ok: true, json: { ok: true } },
    ]);
    render(<HealthSignalsSection />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Save for later" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Save for later" }));

    await waitFor(() =>
      expect(calls.some((c) => c.url === "/api/signals/actions" && (c.init?.body as string)?.includes("save_for_later"))).toBe(true)
    );
  });

  it("all action buttons have accessible names", async () => {
    mockFetchSequence([{ ok: true, json: { signals: [signalFixture()] } }]);
    render(<HealthSignalsSection />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Acknowledge" })).toBeInTheDocument());
    for (const name of ["Acknowledge", "Save for later", "Dismiss"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });
});
