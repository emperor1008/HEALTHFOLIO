/**
 * Headless integration test for Health Tracking logic.
 * Drives the real modules through complete lifecycle scenarios.
 * Run with: npx tsx tests/e2e/health-tracking-logic.ts
 */

import { normalizeTestName, normalizeUnit, buildSourceFingerprint, areTestsEquivalent } from "../../src/lib/measurements/normalization";
import { calculateRangeStatus, getStatusLabel } from "../../src/lib/measurements/status";
import { buildGraphPoints, calculateTrendSummary, isGraphEligible } from "../../src/lib/measurements/trends";
import { getMeasurementDate, isMeasurementGraphable, isMeasurementConfirmed } from "../../src/lib/measurements/types";
import type { MedicalMeasurement } from "../../src/lib/measurements/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${label}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeMeasurement(overrides: Partial<MedicalMeasurement> = {}): MedicalMeasurement {
  return {
    id: "m1", user_id: "u1", portfolio_id: "p1", document_id: "d1", extraction_id: null,
    original_test_name: "HbA1c", normalized_test_name: "hba1c",
    coding_system: null, coding_code: null,
    value_numeric: 6.5, value_text: null,
    original_unit: "%", normalized_unit: "%",
    reference_low: 4.0, reference_high: 6.0, reference_text: "4.0 - 6.0 %",
    report_flag: null, calculated_status: "above_range",
    specimen_collected_at: null, observed_at: "2024-01-15T10:00:00Z", report_issued_at: "2024-01-16T00:00:00Z",
    page_number: 1, evidence_text: "HbA1c: 6.5%",
    confidence: 0.95, verification_status: "verified",
    source_fingerprint: "fp1", created_at: "2024-01-15T10:00:00Z", updated_at: "2024-01-15T10:00:00Z",
    invalidated_at: null,
    ...overrides,
  };
}

// ─── TEST 1: Full normalization lifecycle ────────────────────────────────────
console.log("\n🔬 TEST 1: Normalization lifecycle");

// Upload Report A with "HbA1c" and "Hemoglobin A1c" on different pages
const reportA_hba1c = normalizeTestName("HbA1c");
const reportA_hemoglobin = normalizeTestName("Hemoglobin A1c");
assertEqual(reportA_hba1c, reportA_hemoglobin, "HbA1c and Hemoglobin A1c normalize to same key");
assertEqual(reportA_hba1c, "hba1c", "Normalized key is 'hba1c'");

// Upload Report B with "Fasting Blood Glucose"
const reportB_fbg = normalizeTestName("Fasting Blood Glucose");
const reportB_random = normalizeTestName("Random Blood Glucose");
assert(reportB_fbg !== reportB_random, "FBG and RBG are distinct keys");
assertEqual(reportB_fbg, "fasting_blood_glucose", "FBG normalizes correctly");

// Upload Report C with unknown test
const reportC_unknown = normalizeTestName("Custom Rare Test XYZ");
assertEqual(reportC_unknown, "custom rare test xyz", "Unknown test gets stable canonical form");

// Fingerprint deduplication
const fp1 = buildSourceFingerprint({ documentId: "doc1", pageNumber: 1, normalizedTestName: "hba1c", evidenceText: "HbA1c: 6.5%" });
const fp2 = buildSourceFingerprint({ documentId: "doc1", pageNumber: 1, normalizedTestName: "hba1c", evidenceText: "HbA1c: 6.5%" });
const fp3 = buildSourceFingerprint({ documentId: "doc1", pageNumber: 2, normalizedTestName: "hba1c", evidenceText: "HbA1c: 6.5%" });
assertEqual(fp1, fp2, "Same evidence produces same fingerprint");
assert(fp1 !== fp3, "Different page produces different fingerprint");

// ─── TEST 2: Range status lifecycle ─────────────────────────────────────────
console.log("\n🔬 TEST 2: Range status lifecycle");

// Lab Report A: value 6.5, range 4.0-6.0
assertEqual(calculateRangeStatus({ valueNumeric: 6.5, referenceLow: 4.0, referenceHigh: 6.0, reportFlag: null }), "above_range", "6.5 with range 4-6 is above_range");

// Lab Report B: value 5.0, range 4.0-6.0
assertEqual(calculateRangeStatus({ valueNumeric: 5.0, referenceLow: 4.0, referenceHigh: 6.0, reportFlag: null }), "within_range", "5.0 with range 4-6 is within_range");

// Lab Report C: value 3.5, range 4.0-6.0
assertEqual(calculateRangeStatus({ valueNumeric: 3.5, referenceLow: 4.0, referenceHigh: 6.0, reportFlag: null }), "below_range", "3.5 with range 4-6 is below_range");

// Lab Report D: value 120, no range, flagged "High"
assertEqual(calculateRangeStatus({ valueNumeric: 120, referenceLow: null, referenceHigh: null, reportFlag: "High" }), "report_marked_abnormal", "120 with flag 'High' is report_marked_abnormal");

// Lab Report E: value 95, no range, no flag
assertEqual(calculateRangeStatus({ valueNumeric: 95, referenceLow: null, referenceHigh: null, reportFlag: null }), "cannot_determine", "95 with no range is cannot_determine");

// Boundary: value exactly at upper bound
assertEqual(calculateRangeStatus({ valueNumeric: 6.0, referenceLow: 4.0, referenceHigh: 6.0, reportFlag: null }), "within_range", "6.0 at upper bound is within_range");

// Boundary: value exactly at lower bound
assertEqual(calculateRangeStatus({ valueNumeric: 4.0, referenceLow: 4.0, referenceHigh: 6.0, reportFlag: null }), "within_range", "4.0 at lower bound is within_range");

// ─── TEST 3: Date priority lifecycle ────────────────────────────────────────
console.log("\n🔬 TEST 3: Date priority lifecycle");

// Scenario: specimen collected on Jan 10, observed on Jan 15, reported on Jan 16
const mWithAllDates = makeMeasurement({
  specimen_collected_at: "2024-01-10T08:00:00Z",
  observed_at: "2024-01-15T10:00:00Z",
  report_issued_at: "2024-01-16T00:00:00Z",
});
assertEqual(getMeasurementDate(mWithAllDates), "2024-01-10T08:00:00Z", "specimen_collected_at takes priority");

// No specimen date
const mNoSpecimen = makeMeasurement({
  specimen_collected_at: null,
  observed_at: "2024-01-15T10:00:00Z",
  report_issued_at: "2024-01-16T00:00:00Z",
});
assertEqual(getMeasurementDate(mNoSpecimen), "2024-01-15T10:00:00Z", "observed_at is fallback");

// Only report date
const mOnlyReport = makeMeasurement({
  specimen_collected_at: null,
  observed_at: null,
  report_issued_at: "2024-01-16T00:00:00Z",
});
assertEqual(getMeasurementDate(mOnlyReport), "2024-01-16T00:00:00Z", "report_issued_at is last fallback");

// No dates at all
const mNoDates = makeMeasurement({
  specimen_collected_at: null,
  observed_at: null,
  report_issued_at: null,
});
assertEqual(getMeasurementDate(mNoDates), null, "No dates returns null");
assert(!isMeasurementGraphable(mNoDates), "Measurement without date is not graphable");

// ─── TEST 4: Full trend lifecycle — 2 reports creating a graph ──────────────
console.log("\n🔬 TEST 4: Full trend lifecycle — 2 reports creating a graph");

// Report A: HbA1c 6.5% on Jan 15
const reportA = makeMeasurement({
  id: "m-a",
  original_test_name: "HbA1c",
  normalized_test_name: "hba1c",
  value_numeric: 6.5,
  observed_at: "2024-01-15T10:00:00Z",
  verification_status: "verified",
});

// Report B: HbA1c 5.8% on Jul 15 (same test, same unit)
const reportB = makeMeasurement({
  id: "m-b",
  original_test_name: "Hemoglobin A1c",
  normalized_test_name: "hba1c",
  value_numeric: 5.8,
  observed_at: "2024-07-15T10:00:00Z",
  verification_status: "verified",
});

// Check graph eligibility
const eligibility = isGraphEligible([reportA, reportB]);
assert(eligibility.eligible, "Two verified HbA1c measurements are graph-eligible");

// Build graph points
const points = buildGraphPoints([reportA, reportB]);
assertEqual(points.length, 2, "Two graph points created");
assertEqual(points[0].value, 6.5, "First point is 6.5 (Jan)");
assertEqual(points[1].value, 5.8, "Second point is 5.8 (Jul)");
assert(points[0].date < points[1].date, "Points are chronologically sorted");

// Calculate trend
const trend = calculateTrendSummary("hba1c", [reportA, reportB]);
assert(trend !== null, "Trend summary is not null");
assertEqual(trend!.latestValue, 5.8, "Latest value is 5.8");
assertEqual(trend!.previousValue, 6.5, "Previous value is 6.5");
assertEqual(trend!.changeDirection, "decreased", "Direction is decreased");
assert(trend!.absoluteChange !== null, "Absolute change is computed");
assert(Math.abs(trend!.absoluteChange! - (-0.7)) < 0.01, "Absolute change is -0.7");
assert(trend!.percentChange !== null, "Percent change is computed");
assert(Math.abs(trend!.percentChange! - (-10.77)) < 0.1, "Percent change is ~-10.77%");
assertEqual(trend!.graphableMeasurements, 2, "Graphable measurements count is 2");

// ─── TEST 5: Trend with rejected measurement excluded ───────────────────────
console.log("\n🔬 TEST 5: Rejected measurement excluded from trends");

const rejected = makeMeasurement({
  id: "m-rejected",
  verification_status: "rejected",
});

const verified = makeMeasurement({
  id: "m-verified",
  verification_status: "verified",
  value_numeric: 5.0,
  observed_at: "2024-06-01T10:00:00Z",
});

const elig2 = isGraphEligible([rejected, verified]);
assert(!elig2.eligible, "Only 1 verified measurement is not graph-eligible (needs 2+)");

// ─── TEST 6: Different units prevent graphing ───────────────────────────────
console.log("\n🔬 TEST 6: Different units prevent graphing");

const mgdl = makeMeasurement({
  id: "m-mgdl",
  normalized_unit: "mg/dl",
  verification_status: "verified",
});

const mmoll = makeMeasurement({
  id: "m-mmoll",
  normalized_unit: "mmol/l",
  verification_status: "verified",
});

const elig3 = isGraphEligible([mgdl, mmoll]);
assert(!elig3.eligible, "Different units prevent graphing");
assert(elig3.reason!.includes("different units"), "Reason mentions different units");

// ─── TEST 7: Invalidation lifecycle ─────────────────────────────────────────
console.log("\n🔬 TEST 7: Invalidation lifecycle");

const active = makeMeasurement({ id: "m-active", invalidated_at: null });
const invalidated = makeMeasurement({ id: "m-inv", invalidated_at: "2024-02-01T00:00:00Z" });

assert(isMeasurementGraphable(active), "Active measurement is graphable");
assert(!isMeasurementGraphable(invalidated), "Invalidated measurement is not graphable");
assert(isMeasurementConfirmed(active), "Active measurement is confirmed");
assert(!isMeasurementConfirmed(invalidated), "Invalidated measurement is not confirmed");

// ─── TEST 8: Text-only measurement is not graphable ─────────────────────────
console.log("\n🔬 TEST 8: Text-only measurement is not graphable");

const textOnly = makeMeasurement({
  id: "m-text",
  value_numeric: null,
  value_text: "Positive",
  verification_status: "verified",
});

assert(!isMeasurementGraphable(textOnly), "Text-only measurement is not graphable");
assert(isMeasurementConfirmed(textOnly), "Text-only measurement is still confirmed");

// ─── TEST 9: Zero previous value — no division by zero ──────────────────────
console.log("\n🔬 TEST 9: Zero previous value — no division by zero");

const zeroPrev = makeMeasurement({
  id: "m-zero",
  value_numeric: 0,
  observed_at: "2024-01-15T10:00:00Z",
  verification_status: "verified",
});

const afterZero = makeMeasurement({
  id: "m-after",
  value_numeric: 5,
  observed_at: "2024-06-01T10:00:00Z",
  verification_status: "verified",
});

const trendZero = calculateTrendSummary("hba1c", [zeroPrev, afterZero]);
assertEqual(trendZero!.percentChange, null, "Percent change is null when previous is 0 (no division by zero)");
assertEqual(trendZero!.absoluteChange, 5, "Absolute change is 5");
assertEqual(trendZero!.changeDirection, "increased", "Direction is increased");

// ─── TEST 10: Single measurement — insufficient data ────────────────────────
console.log("\n🔬 TEST 10: Single measurement — insufficient data");

const single = makeMeasurement({
  id: "m-single",
  verification_status: "verified",
  observed_at: "2024-01-15T10:00:00Z",
});

const trendSingle = calculateTrendSummary("hba1c", [single]);
assert(trendSingle !== null, "Trend exists for single measurement");
assertEqual(trendSingle!.previousValue, null, "No previous value");
assertEqual(trendSingle!.changeDirection, "insufficient_data", "Direction is insufficient_data");
assertEqual(trendSingle!.graphableMeasurements, 1, "One graphable measurement");

// ─── TEST 11: Fingerprint prevents duplicate storage ────────────────────────
console.log("\n🔬 TEST 11: Fingerprint prevents duplicate storage");

const fpA = buildSourceFingerprint({ documentId: "d1", pageNumber: 1, normalizedTestName: "hba1c", evidenceText: "HbA1c: 6.5%" });
const fpB = buildSourceFingerprint({ documentId: "d1", pageNumber: 1, normalizedTestName: "hba1c", evidenceText: "HbA1c: 6.5%" });
const fpC = buildSourceFingerprint({ documentId: "d2", pageNumber: 1, normalizedTestName: "hba1c", evidenceText: "HbA1c: 6.5%" });
const fpD = buildSourceFingerprint({ documentId: "d1", pageNumber: 1, normalizedTestName: "hba1c", evidenceText: "HbA1c: 7.2%" });

assertEqual(fpA, fpB, "Same document+page+evidence = same fingerprint");
assert(fpA !== fpC, "Different document = different fingerprint");
assert(fpA !== fpD, "Different evidence = different fingerprint");

// ─── TEST 12: Status label human-readable output ────────────────────────────
console.log("\n🔬 TEST 12: Status labels are human-readable");

const label1 = getStatusLabel("within_range");
assert(label1.includes("Within"), "within_range label contains 'Within'");

const label2 = getStatusLabel("above_range");
assert(label2.includes("Above"), "above_range label contains 'Above'");

const label3 = getStatusLabel("report_marked_abnormal");
assert(label3.includes("Marked abnormal"), "report_marked_abnormal label contains 'Marked abnormal'");

const label4 = getStatusLabel("cannot_determine");
assert(label4.includes("could not be determined"), "cannot_determine label is appropriate");

// No label says "healthy" or "unhealthy"
const statusValues = ["within_range", "above_range", "below_range", "report_marked_abnormal", "cannot_determine"] as const;
const allLabels = statusValues.map((s) => getStatusLabel(s));
for (const l of allLabels) {
  assert(!l.toLowerCase().includes("healthy"), `Label "${l}" does not say "healthy"`);
  assert(!l.toLowerCase().includes("unhealthy"), `Label "${l}" does not say "unhealthy"`);
  assert(!l.toLowerCase().includes("disease"), `Label "${l}" does not say "disease"`);
}

// ─── TEST 13: Equivalent tests grouped correctly ────────────────────────────
console.log("\n🔬 TEST 13: Equivalent tests are grouped");

const pairs: [string, string, boolean][] = [
  ["HbA1c", "Hemoglobin A1c", true],
  ["LDL", "LDL Cholesterol", true],
  ["HDL", "HDL Cholesterol", true],
  ["Fasting Glucose", "Random Glucose", false],
  ["Creatinine", "Creatinine Clearance", false],
  ["Free T4", "Total T4", false],
  ["Total Cholesterol", "LDL Cholesterol", false],
  ["TSH", "Free T4", false],
];

for (const [a, b, expected] of pairs) {
  const result = areTestsEquivalent(a, b);
  assertEqual(result, expected, `"${a}" vs "${b}": ${expected ? "equivalent" : "distinct"}`);
}

// ─── SUMMARY ────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} total`);
console.log(`${"=".repeat(60)}`);

if (failed > 0) {
  process.exit(1);
}
