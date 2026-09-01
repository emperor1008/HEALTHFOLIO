/**
 * Test Name Matcher for Ask Healthfolio
 *
 * Maps user-mentioned test names to canonical identities.
 * Handles abbreviations, misspellings, and variant naming.
 * Distinguishes clinically different tests that share partial names.
 */

export interface TestMatch {
  canonicalName: string;
  queryTerm: string;
  confidence: number;
  matchMethod: "exact" | "alias" | "abbreviation" | "partial" | "none";
  wasCorrected: boolean;
  alternatives: string[];
}

// ─── Canonical test identities with aliases ────────────────────────────────

interface TestIdentity {
  canonical: string;
  aliases: string[];
  description: string;
}

const TEST_IDENTITIES: TestIdentity[] = [
  {
    canonical: "hemoglobin_a1c",
    aliases: [
      "hba1c",
      "hgbalc",
      "hemoglobin a1c",
      "hemoglobin alc",
      "hemoglobin a 1c",
      "hba 1c",
      "hba 1c",
      "glycated hemoglobin",
      "glycated haemoglobin",
      "hemoglobin ac1",
      "hba1c fasting",
      "hb a1c",
      "hb a1c",
      "hba1c (%)",
      "hba1c (ifcc)",
      "hba1c (ngsp)",
    ],
    description: "Glycated hemoglobin — measures average blood sugar over 2-3 months",
  },
  {
    canonical: "fasting_glucose",
    aliases: [
      "fasting blood sugar",
      "fasting blood glucose",
      "fbs",
      "fasting glucose",
      "blood sugar fasting",
      "bs fasting",
      "sugar fasting",
      "fbg",
      "glucose fasting",
      "glucose (fasting)",
      "glucose (f)",
      "fasting sugar",
      "plasma glucose fasting",
    ],
    description: "Fasting blood glucose — measured after 8+ hours without food",
  },
  {
    canonical: "random_glucose",
    aliases: [
      "random blood sugar",
      "random blood glucose",
      "rbs",
      "random glucose",
      "blood sugar random",
      "bs random",
      "glucose random",
      "ppbs",
      "postprandial blood sugar",
      "postprandial glucose",
      "post meal sugar",
      "post meal glucose",
      "glucose (r)",
      "glucose (pp)",
    ],
    description: "Random or postprandial blood glucose — measured at any time",
  },
  {
    canonical: "total_cholesterol",
    aliases: [
      "total cholesterol",
      "cholesterol",
      "serum cholesterol",
      "s cholesterol",
      "cholesterol (total)",
      "chol",
    ],
    description: "Total serum cholesterol",
  },
  {
    canonical: "ldl_cholesterol",
    aliases: [
      "ldl",
      "ldl cholesterol",
      "low density lipoprotein",
      "ldl cholestrol",
      "ldl c",
      "ldl (direct)",
    ],
    description: "LDL cholesterol — often called 'bad cholesterol'",
  },
  {
    canonical: "hdl_cholesterol",
    aliases: [
      "hdl",
      "hdl cholesterol",
      "high density lipoprotein",
      "hdl cholestrol",
      "hdl c",
    ],
    description: "HDL cholesterol — often called 'good cholesterol'",
  },
  {
    canonical: "triglycerides",
    aliases: [
      "triglycerides",
      "triglyceride",
      "tg",
      "tgl",
      "serum triglycerides",
      "s triglycerides",
      "triglycerides (fasting)",
    ],
    description: "Serum triglycerides — a type of fat in the blood",
  },
  {
    canonical: "tsh",
    aliases: [
      "tsh",
      "thyroid stimulating hormone",
      "thyroid stim hormone",
      "thyrotropin",
    ],
    description: "Thyroid stimulating hormone — screens for thyroid disorders",
  },
  {
    canonical: "free_t4",
    aliases: [
      "free t4",
      "ft4",
      "free thyroxine",
      "t4 free",
      "thyroxine free",
    ],
    description: "Free T4 — active thyroid hormone",
  },
  {
    canonical: "total_t4",
    aliases: [
      "total t4",
      "tt4",
      "total thyroxine",
      "t4 total",
    ],
    description: "Total T4 — all thyroxine in blood (bound + free)",
  },
  {
    canonical: "free_t3",
    aliases: [
      "free t3",
      "ft3",
    ],
    description: "Free T3 — active thyroid hormone",
  },
  {
    canonical: "serum_creatinine",
    aliases: [
      "serum creatinine",
      "s creatinine",
      "s creat",
      "s.creat",
      "creatinine",
      "blood creatinine",
      "serum creat",
      "creatinine serum",
    ],
    description: "Serum creatinine — measures kidney function",
  },
  {
    canonical: "blood_urea",
    aliases: [
      "blood urea",
      "bun",
      "blood urea nitrogen",
      "urea",
      "s urea",
      "blood urea nitrogen",
      "b.u.n",
    ],
    description: "Blood urea / BUN — measures kidney function",
  },
  {
    canonical: "uric_acid",
    aliases: [
      "uric acid",
      "s uric acid",
      "sua",
      "serum uric acid",
    ],
    description: "Serum uric acid — associated with gout and kidney stones",
  },
  {
    canonical: "alt",
    aliases: [
      "alt",
      "sgpt",
      "alanine aminotransferase",
      "serum sgpt",
      "liver enzyme alt",
      "alt (sgpt)",
    ],
    description: "ALT / SGPT — liver enzyme marker",
  },
  {
    canonical: "ast",
    aliases: [
      "ast",
      "sgot",
      "aspartate aminotransferase",
      "serum sgot",
      "ast (sgot)",
    ],
    description: "AST / SGOT — liver and heart enzyme marker",
  },
  {
    canonical: "hemoglobin",
    aliases: [
      "hemoglobin",
      "haemoglobin",
      "hgb",
      "hb",
      "haemoglobin",
      "blood haemoglobin",
      "hb (hemoglobin)",
    ],
    description: "Hemoglobin — measures oxygen-carrying capacity of blood",
  },
  {
    canonical: "wbc",
    aliases: [
      "wbc",
      "white blood cell",
      "white blood cells",
      "leukocyte",
      "leucocyte",
      "total count",
      "tc",
      "tlc",
      "total leukocyte count",
    ],
    description: "White blood cell count — immune system indicator",
  },
  {
    canonical: "platelets",
    aliases: [
      "platelets",
      "platelet count",
      "plt",
      "platelet",
      "thrombocytes",
      "platelets count",
    ],
    description: "Platelet count — blood clotting ability",
  },
  {
    canonical: "esr",
    aliases: [
      "esr",
      "erythrocyte sedimentation rate",
      "sed rate",
      "sedimentation rate",
    ],
    description: "ESR — inflammation marker",
  },
  {
    canonical: "crp",
    aliases: [
      "crp",
      "c-reactive protein",
      "c reactive protein",
      "high sensitivity crp",
      "hs crp",
      "hs-crp",
    ],
    description: "CRP — inflammation marker",
  },
  {
    canonical: "vitamin_d",
    aliases: [
      "vitamin d",
      "vit d",
      "25-hydroxyvitamin d",
      "25 oh vitamin d",
      "vitamin d3",
      "vit d3",
      "25-oh d",
    ],
    description: "Vitamin D — bone and immune health",
  },
  {
    canonical: "vitamin_b12",
    aliases: [
      "vitamin b12",
      "vit b12",
      "b12",
      "cobalamin",
      "serum b12",
      "serum vitamin b12",
    ],
    description: "Vitamin B12 — nerve and blood cell health",
  },
  {
    canonical: "hbsag",
    aliases: [
      "hbsag",
      "hepatitis b surface antigen",
      "hepatitis b antigen",
      "hepatitis b",
    ],
    description: "Hepatitis B surface antigen — screens for Hepatitis B infection",
  },
  {
    canonical: "blood_group",
    aliases: [
      "blood group",
      "blood type",
      "abo group",
      "abo blood group",
      "rh factor",
    ],
    description: "Blood group / ABO typing",
  },
];

// ─── Deduplication: keep clinically distinct tests separate ─────────────────

// These pairs should NOT be merged even if names overlap partially:
const KEEP_DISTINCT = [
  ["hemoglobin", "hemoglobin_a1c"],
  ["fasting_glucose", "random_glucose"],
  ["total_cholesterol", "ldl_cholesterol", "hdl_cholesterol"],
  ["total_t4", "free_t4"],
  ["creatine_kinase", "serum_creatinine"],
];

// ─── Matching ──────────────────────────────────────────────────────────────

/**
 * Match a user's test name against known test identities.
 */
export function matchTestName(queryTerm: string): TestMatch {
  const lower = queryTerm.toLowerCase().trim();

  // 1. Exact match against canonical names
  for (const identity of Array.from(TEST_IDENTITIES)) {
    if (lower === identity.canonical.replace(/_/g, " ") || lower === identity.canonical) {
      return {
        canonicalName: identity.canonical,
        queryTerm,
        confidence: 1.0,
        matchMethod: "exact",
        wasCorrected: false,
        alternatives: [],
      };
    }
  }

  // 2. Alias match
  for (const identity of Array.from(TEST_IDENTITIES)) {
    for (const alias of identity.aliases) {
      if (lower === alias.toLowerCase()) {
        return {
          canonicalName: identity.canonical,
          queryTerm,
          confidence: 0.95,
          matchMethod: "alias",
          wasCorrected: lower !== alias.toLowerCase(),
          alternatives: findTestAlternatives(identity.canonical),
        };
      }
    }
  }

  // 3. Abbreviation match (case-insensitive, leading/trailing space ok)
  for (const identity of Array.from(TEST_IDENTITIES)) {
    const abbreviations = identity.aliases.filter((a) => a.length <= 6);
    for (const abbr of abbreviations) {
      if (lower === abbr.toLowerCase()) {
        return {
          canonicalName: identity.canonical,
          queryTerm,
          confidence: 0.90,
          matchMethod: "abbreviation",
          wasCorrected: true,
          alternatives: findTestAlternatives(identity.canonical),
        };
      }
    }
  }

  // 4. Partial / contains match
  for (const identity of Array.from(TEST_IDENTITIES)) {
    for (const alias of identity.aliases) {
      if (
        alias.toLowerCase().includes(lower) &&
        lower.length >= 3 &&
        alias.length - lower.length <= 4
      ) {
        return {
          canonicalName: identity.canonical,
          queryTerm,
          confidence: 0.70,
          matchMethod: "partial",
          wasCorrected: true,
          alternatives: findTestAlternatives(identity.canonical),
        };
      }
    }
  }

  // 5. No match
  return {
    canonicalName: queryTerm,
    queryTerm,
    confidence: 0,
    matchMethod: "none",
    wasCorrected: false,
    alternatives: [],
  };
}

/**
 * Get test identity information for display.
 */
export function getTestIdentity(canonicalName: string): TestIdentity | undefined {
  return TEST_IDENTITIES.find((t) => t.canonical === canonicalName);
}

function findTestAlternatives(canonical: string): string[] {
  // Find other test identities that share a partial name
  const alts: string[] = [];
  const parts = canonical.split("_");

  for (const identity of Array.from(TEST_IDENTITIES)) {
    if (identity.canonical === canonical) continue;
    const otherParts = identity.canonical.split("_");
    const shared = parts.filter((p) => otherParts.includes(p));
    if (shared.length >= 1 && shared.length < parts.length) {
      alts.push(identity.canonical.replace(/_/g, " "));
    }
  }

  return alts.slice(0, 3);
}
