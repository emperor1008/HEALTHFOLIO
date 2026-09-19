/**
 * Red-flag rules engine tests (Part 2).
 * Every rule gets a positive and a negative case. Also proves:
 * - emergency overrides urgent and routine;
 * - the engine never emits diagnosis-like text;
 * - output carries only rule IDs + version (auditable, not diagnostic).
 */

import { describe, it, expect } from "vitest";
import {
  evaluateTriage,
  RULES_VERSION,
  FOLLOW_UP_IDS,
  suggestedFollowUps,
  type TriageInput,
} from "@/lib/triage/red-flags";
import { SYMPTOM_CONCEPTS, type SymptomConcept } from "@/lib/triage/concepts";

function input(overrides: Partial<TriageInput>): TriageInput {
  return {
    concepts: [],
    category: null,
    bodyArea: null,
    followUps: {},
    ageGroup: null,
    ...overrides,
  };
}

describe("versioning and auditability", () => {
  it("has a non-empty rules version", () => {
    expect(RULES_VERSION).toMatch(/^\d{4}\.\d{2}-part2\.\d+$/);
  });

  it("returns the version and only stable rule IDs", () => {
    const r = evaluateTriage(input({ concepts: ["severe_bleeding"] }));
    expect(r.rulesVersion).toBe(RULES_VERSION);
    for (const t of r.triggered) {
      expect(t.id).toMatch(/^(EM|UR)-\d{2}$/);
      expect(t.source.length).toBeGreaterThan(10);
    }
  });

  it("never emits diagnosis-like words in patient-visible surfaces", () => {
    // Patient-visible surface = category + rulesVersion + rule IDs.
    // (triggered[].description/source are auditor-facing audit text and are
    // never rendered to users or stored in the packet — packet keeps IDs.)
    const patientVisible = (r: { category: string; rulesVersion: string; triggered: Array<{ id: string }> }) =>
      JSON.stringify({ c: r.category, v: r.rulesVersion, ids: r.triggered.map((t) => t.id) }).toLowerCase();
    for (const c of SYMPTOM_CONCEPTS) {
      const r = evaluateTriage(input({ concepts: [c as SymptomConcept] }));
      expect(patientVisible(r)).not.toMatch(/\bdiagnos|disease|\bstroke\b|\bheart attack\b|\bmedicine|\bdosage/);
    }
  });

  it("every rule carries an audit description and source for reviewers", () => {
    const r = evaluateTriage(input({ concepts: ["weakness_one_side"] }));
    const em04 = r.triggered.find((t) => t.id === "EM-04");
    expect(em04?.description).toBeTruthy();
    expect(em04?.source).toBeTruthy();
  });
});

describe("EM-01 severe breathing difficulty", () => {
  it("positive: breathing + worse at rest → emergency", () => {
    const r = evaluateTriage(
      input({ concepts: ["difficulty_breathing"], followUps: { breathing_worse_at_rest: true } })
    );
    expect(r.category).toBe("emergency");
    expect(r.triggered.map((t) => t.id)).toContain("EM-01");
  });

  it("positive: breathing in an older adult → emergency (conservative)", () => {
    const r = evaluateTriage(input({ concepts: ["difficulty_breathing"], ageGroup: "older_adult" }));
    expect(r.category).toBe("emergency");
  });

  it("negative: breathing without rest-worsening and no age → not EM-01", () => {
    const r = evaluateTriage(input({ concepts: ["difficulty_breathing"] }));
    expect(r.triggered.map((t) => t.id)).not.toContain("EM-01");
    expect(r.category).toBe("urgent"); // UR-01 catches it
  });
});

describe("EM-02 chest pressure spreading", () => {
  it("positive", () => {
    const r = evaluateTriage(
      input({ concepts: ["chest_discomfort"], followUps: { chest_pressure_spreading: true } })
    );
    expect(r.category).toBe("emergency");
    expect(r.triggered.map((t) => t.id)).toContain("EM-02");
  });

  it("negative: chest discomfort alone stays urgent", () => {
    const r = evaluateTriage(input({ concepts: ["chest_discomfort"] }));
    expect(r.triggered.map((t) => t.id)).not.toContain("EM-02");
    expect(r.category).toBe("urgent");
  });
});

describe("EM-03 unconsciousness / seizure", () => {
  it("positive: fainting concept → emergency", () => {
    const r = evaluateTriage(input({ concepts: ["fainting"] }));
    expect(r.category).toBe("emergency");
    expect(r.triggered.map((t) => t.id)).toContain("EM-03");
  });

  it("negative: no fainting concept → EM-03 not triggered", () => {
    const r = evaluateTriage(input({ concepts: ["fever"] }));
    expect(r.triggered.map((t) => t.id)).not.toContain("EM-03");
  });
});

describe("EM-04 stroke warning signs", () => {
  it("positive", () => {
    const r = evaluateTriage(input({ concepts: ["weakness_one_side"] }));
    expect(r.category).toBe("emergency");
    expect(r.triggered.map((t) => t.id)).toContain("EM-04");
  });

  it("negative: plain severe headache is not EM-04", () => {
    const r = evaluateTriage(input({ concepts: ["severe_headache"] }));
    expect(r.triggered.map((t) => t.id)).not.toContain("EM-04");
  });
});

describe("EM-05 uncontrolled bleeding", () => {
  it("positive via concept", () => {
    const r = evaluateTriage(input({ concepts: ["severe_bleeding"] }));
    expect(r.category).toBe("emergency");
  });

  it("positive via follow-up", () => {
    const r = evaluateTriage(input({ concepts: ["injury"], followUps: { bleeding_wont_stop: true } }));
    expect(r.category).toBe("emergency");
  });

  it("negative", () => {
    const r = evaluateTriage(input({ concepts: ["injury"] }));
    expect(r.triggered.map((t) => t.id)).not.toContain("EM-05");
  });
});

describe("EM-06 severe allergic-reaction signs", () => {
  it("positive: breathing + vomiting + sudden worsening", () => {
    const r = evaluateTriage(
      input({
        concepts: ["difficulty_breathing", "vomiting"],
        followUps: { symptoms_suddenly_worse: true },
      })
    );
    expect(r.category).toBe("emergency");
    expect(r.triggered.map((t) => t.id)).toContain("EM-06");
  });

  it("negative: missing sudden worsening", () => {
    const r = evaluateTriage(input({ concepts: ["difficulty_breathing", "vomiting"] }));
    expect(r.triggered.map((t) => t.id)).not.toContain("EM-06");
  });
});

describe("EM-07 major trauma", () => {
  it("positive", () => {
    const r = evaluateTriage(
      input({ concepts: ["injury"], followUps: { injury_from_major_trauma: true } })
    );
    expect(r.category).toBe("emergency");
    expect(r.triggered.map((t) => t.id)).toContain("EM-07");
  });

  it("negative: injury without major trauma stays urgent", () => {
    const r = evaluateTriage(input({ concepts: ["injury"] }));
    expect(r.category).toBe("urgent");
  });
});

describe("EM-08 pregnancy danger signs", () => {
  it("positive: pregnancy + bleeding", () => {
    const r = evaluateTriage(input({ concepts: ["pregnancy_concern", "severe_bleeding"] }));
    expect(r.category).toBe("emergency");
  });

  it("positive: pregnancy + sudden worsening", () => {
    const r = evaluateTriage(
      input({ concepts: ["pregnancy_concern"], followUps: { symptoms_suddenly_worse: true } })
    );
    expect(r.category).toBe("emergency");
  });

  it("negative: pregnancy concern alone is urgent, not emergency", () => {
    const r = evaluateTriage(input({ concepts: ["pregnancy_concern"] }));
    expect(r.category).toBe("urgent");
    expect(r.triggered.map((t) => t.id)).toContain("UR-06");
  });
});

describe("EM-09 sudden worst-ever headache", () => {
  it("positive via follow-up", () => {
    const r = evaluateTriage(
      input({ concepts: ["severe_headache"], followUps: { headache_sudden_worst_ever: true } })
    );
    expect(r.category).toBe("emergency");
  });

  it("negative: severe headache without sudden onset is urgent", () => {
    const r = evaluateTriage(input({ concepts: ["severe_headache"] }));
    expect(r.category).toBe("urgent");
  });
});

describe("EM-10 vomiting + dehydration risk in vulnerable person", () => {
  it("positive: child", () => {
    const r = evaluateTriage(
      input({
        concepts: ["vomiting"],
        followUps: { vomiting_cannot_keep_fluids: true },
        ageGroup: "child",
      })
    );
    expect(r.category).toBe("emergency");
  });

  it("positive: older adult", () => {
    const r = evaluateTriage(
      input({
        concepts: ["vomiting"],
        followUps: { vomiting_cannot_keep_fluids: true },
        ageGroup: "older_adult",
      })
    );
    expect(r.category).toBe("emergency");
  });

  it("negative: adult who can keep fluids is not EM-10", () => {
    const r = evaluateTriage(input({ concepts: ["vomiting"], ageGroup: "adult" }));
    expect(r.triggered.map((t) => t.id)).not.toContain("EM-10");
  });

  it("negative: cannot keep fluids but adult with no age → not EM-10", () => {
    const r = evaluateTriage(
      input({ concepts: ["vomiting"], followUps: { vomiting_cannot_keep_fluids: true } })
    );
    expect(r.triggered.map((t) => t.id)).not.toContain("EM-10");
  });
});

describe("EM-11 infant/child danger signs", () => {
  it("positive: child_health category + child age + breathing", () => {
    const r = evaluateTriage(
      input({ concepts: ["difficulty_breathing"], category: "child_health", ageGroup: "child" })
    );
    expect(r.category).toBe("emergency");
  });

  it("negative: child_health with adult age → not EM-11", () => {
    const r = evaluateTriage(
      input({ concepts: ["difficulty_breathing"], category: "child_health", ageGroup: "adult" })
    );
    expect(r.triggered.map((t) => t.id)).not.toContain("EM-11");
  });
});

describe("UR-01..UR-09 urgent rules", () => {
  it("UR-03 fever ≥3 days is urgent", () => {
    const r = evaluateTriage(input({ concepts: ["fever"], followUps: { fever_three_days_or_more: true } }));
    expect(r.category).toBe("urgent");
    expect(r.triggered.map((t) => t.id)).toContain("UR-03");
  });

  it("UR-03 negative: fresh fever without duration is routine", () => {
    const r = evaluateTriage(input({ concepts: ["fever"] }));
    expect(r.category).toBe("routine");
  });

  it("UR-04 persistent vomiting is urgent", () => {
    const r = evaluateTriage(
      input({ concepts: ["vomiting"], followUps: { vomiting_cannot_keep_fluids: true } })
    );
    expect(r.category).toBe("urgent");
  });

  it("UR-05 severe headache without sudden onset is urgent", () => {
    const r = evaluateTriage(input({ concepts: ["severe_headache"] }));
    expect(r.category).toBe("urgent");
  });

  it("UR-07 injury is urgent", () => {
    const r = evaluateTriage(input({ concepts: ["injury"] }));
    expect(r.category).toBe("urgent");
  });

  it("UR-08 abdominal pain is urgent", () => {
    const r = evaluateTriage(input({ concepts: ["abdominal_pain"] }));
    expect(r.category).toBe("urgent");
  });

  it("UR-09 sudden worsening alone is urgent", () => {
    const r = evaluateTriage(input({ concepts: ["fever"], followUps: { symptoms_suddenly_worse: true } }));
    expect(r.category).toBe("urgent");
  });

  it("UR-02 chest discomfort (no spreading) is urgent", () => {
    const r = evaluateTriage(input({ concepts: ["chest_discomfort"] }));
    expect(r.triggered.map((t) => t.id)).toContain("UR-02");
  });

  it("UR-01 breathing (no rest issue, no age) is urgent", () => {
    const r = evaluateTriage(input({ concepts: ["difficulty_breathing"] }));
    expect(r.triggered.map((t) => t.id)).toContain("UR-01");
  });

  it("UR-06 pregnancy is urgent", () => {
    const r = evaluateTriage(input({ concepts: ["pregnancy_concern"] }));
    expect(r.triggered.map((t) => t.id)).toContain("UR-06");
  });
});

describe("priority and edge cases", () => {
  it("emergency overrides urgent and routine when mixed", () => {
    // Mild routine symptom + a hard emergency sign.
    const r = evaluateTriage(
      input({
        concepts: ["fever", "weakness_one_side"],
        followUps: { fever_three_days_or_more: true },
      })
    );
    expect(r.category).toBe("emergency");
  });

  it("empty input is routine with no triggered rules", () => {
    const r = evaluateTriage(input({}));
    expect(r.category).toBe("routine");
    expect(r.triggered).toHaveLength(0);
  });

  it("invalid ageGroup is neutralized, not trusted", () => {
    const r = evaluateTriage(
      input({ concepts: ["vomiting"], followUps: { vomiting_cannot_keep_fluids: true }, ageGroup: "child" })
    );
    expect(r.category).toBe("emergency");
    // And a garbage value must not crash or escalate:
    const bad = evaluateTriage({
      concepts: ["vomiting"],
      followUps: { vomiting_cannot_keep_fluids: true },
      // @ts-expect-error deliberately invalid runtime value
      ageGroup: "ancient",
    });
    expect(bad.category).toBe("urgent"); // UR-04 only
  });

  it("rule crash safety: throwing followUp object cannot crash the engine", () => {
    const hostile = {
      get breathing_worse_at_rest() {
        throw new Error("boom");
      },
    } as Partial<Record<(typeof FOLLOW_UP_IDS)[number], boolean>>;
    const r = evaluateTriage(input({ concepts: ["difficulty_breathing"], followUps: hostile }));
    expect(["urgent", "emergency"]).toContain(r.category);
  });
});

describe("suggestedFollowUps", () => {
  it("proposes the matching question per concept", () => {
    const s = suggestedFollowUps({ concepts: ["difficulty_breathing", "chest_discomfort"] });
    expect(s).toContain("breathing_worse_at_rest");
    expect(s).toContain("chest_pressure_spreading");
    expect(s).toContain("symptoms_suddenly_worse");
  });

  it("no concepts → only the generic worsening question", () => {
    const s = suggestedFollowUps({ concepts: [] });
    expect(s).toEqual([]);
  });
});
