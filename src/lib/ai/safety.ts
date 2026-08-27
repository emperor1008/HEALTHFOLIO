const BOUNDARY_MSG =
  "Healthfolio organizes medical information and helps you prepare for consultations. It does not diagnose conditions, recommend treatment, or replace a healthcare professional.";

const EMERGENCY_MSG =
  "If you are experiencing a medical emergency, please contact your local emergency services or go to the nearest emergency room immediately. Healthfolio cannot assess emergencies or provide urgent medical guidance.";

export function checkSafetyBoundary(text: string): {
  allowed: boolean;
  response?: string;
  violationType?: string;
} {
  if (/\b(emergency|call\s*(911|ambulance|108)|chest\s*pain|stroke|seizure|overdose|poisoning)\b/i.test(text)) {
    return { allowed: false, response: EMERGENCY_MSG, violationType: "emergency" };
  }

  if (/\b(diagnos(?:e|is|ed|ing)|do\s+i\s+have|am\s+i\s+sick|what\s+is\s+wrong)\b/i.test(text)) {
    return { allowed: false, response: BOUNDARY_MSG, violationType: "diagnosis" };
  }

  if (/\b(treat(?:ment|ing)|prescri(?:be|bed|ption)|medication\s+(?:change|start|stop|adjust|increase|decrease|modify|dosage))\b/i.test(text)) {
    return { allowed: false, response: BOUNDARY_MSG, violationType: "treatment" };
  }

  if (/\b(should\s+i\s+(?:stop|start|take|change|reduce|increase)\s+(?:my|the|this)\s+(?:med|medication|drug|pill|tablet|dose))\b/i.test(text)) {
    return { allowed: false, response: BOUNDARY_MSG, violationType: "medication_change" };
  }

  return { allowed: true };
}
