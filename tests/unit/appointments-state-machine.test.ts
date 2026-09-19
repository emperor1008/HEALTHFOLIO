/**
 * Appointment lifecycle state machine tests.
 * Every legal transition passes; every illegal transition or unauthorized
 * actor is rejected; duplicates are idempotent no-ops.
 */
import { describe, it, expect } from "vitest";
import {
  validateAppointmentTransition,
  allowedTransitions,
  APPOINTMENT_STATES,
} from "@/lib/appointments/state-machine";

const v = (from: string, to: string, actorRole: "patient" | "clinician" | "coordinator" | "system") =>
  validateAppointmentTransition({ from, to, actorRole });

describe("legal transitions", () => {
  const happyPath: Array<[string, string, "patient" | "clinician" | "coordinator" | "system"]> = [
    ["draft", "queued_offline", "patient"],
    ["queued_offline", "submitted", "system"],
    ["submitted", "awaiting_review", "coordinator"],
    ["awaiting_review", "assigned", "clinician"],
    ["assigned", "accepted", "clinician"],
    ["accepted", "appointment_proposed", "clinician"],
    ["appointment_proposed", "appointment_confirmed", "patient"],
    ["appointment_confirmed", "in_consultation", "clinician"],
    ["in_consultation", "completed", "clinician"],
  ];
  for (const [from, to, role] of happyPath) {
    it(`${from} → ${to} by ${role} passes`, () => {
      expect(v(from, to, role)).toMatchObject({ ok: true, kind: "ok" });
    });
  }
});

describe("illegal transitions", () => {
  const cases: Array<[string, string, "patient" | "clinician" | "coordinator" | "system"]> = [
    ["draft", "appointment_confirmed", "coordinator"], // cannot skip lifecycle
    ["submitted", "accepted", "clinician"], // must be assigned first
    ["assigned", "completed", "clinician"], // no skipping to completed
    ["appointment_proposed", "in_consultation", "clinician"], // patient must ack
    ["in_consultation", "draft", "system"],
    ["completed", "in_consultation", "clinician"], // terminal
    ["cancelled", "submitted", "patient"], // terminal
    ["declined", "accepted", "clinician"], // terminal
    ["expired", "appointment_confirmed", "patient"], // terminal
    ["needs_attention", "completed", "system"], // terminal
  ];
  for (const [from, to, role] of cases) {
    it(`${from} → ${to} by ${role} is rejected`, () => {
      const r = v(from, to, role);
      expect(r.ok).toBe(false);
      expect(r.kind).toBe("invalid");
    });
  }

  it("unknown state is rejected", () => {
    expect(v("teleported", "accepted", "clinician").ok).toBe(false);
  });
});

describe("role authorization", () => {
  it("patient cannot accept their own request", () => {
    expect(v("assigned", "accepted", "patient").ok).toBe(false);
  });

  it("clinician cannot confirm the appointment (patient ack required)", () => {
    expect(v("appointment_proposed", "appointment_confirmed", "clinician").ok).toBe(false);
  });

  it("system cannot assign or accept (staff action)", () => {
    expect(v("awaiting_review", "assigned", "system").ok).toBe(false);
    expect(v("assigned", "accepted", "system").ok).toBe(false);
  });

  it("patient can cancel an unstarted appointment", () => {
    expect(v("appointment_proposed", "cancelled", "patient").ok).toBe(true);
  });

  it("patient cannot cancel after consultation started", () => {
    expect(v("in_consultation", "cancelled", "patient").ok).toBe(false);
  });

  it("coordinator can mark expired after confirmation", () => {
    expect(v("appointment_confirmed", "expired", "coordinator").ok).toBe(true);
  });
});

describe("idempotency", () => {
  it("re-asserting the current state is a no-op", () => {
    for (const state of APPOINTMENT_STATES) {
      expect(v(state, state, "patient")).toMatchObject({ ok: true, kind: "noop" });
    }
  });
});

describe("allowedTransitions helper", () => {
  it("lists only transitions permitted for the actor", () => {
    expect(allowedTransitions("assigned", "clinician")).toContain("accepted");
    expect(allowedTransitions("assigned", "patient")).not.toContain("accepted");
    expect(allowedTransitions("completed", "clinician")).toEqual([]);
  });
});
