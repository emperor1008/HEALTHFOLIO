/**
 * Approved Health References for General Education
 *
 * Only authoritative, approved domains are allowed for general health
 * education answers. This is NOT personal medical data.
 */

export interface ApprovedReference {
  organization: string;
  domain: string;
  baseUrl: string;
  description: string;
}

export const APPROVED_REFERENCES: ApprovedReference[] = [
  {
    organization: "World Health Organization (WHO)",
    domain: "who.int",
    baseUrl: "https://www.who.int",
    description: "Global public health guidance and disease information",
  },
  {
    organization: "National Institute of Nutrition (ICMR-NIN)",
    domain: "nin.res.in",
    baseUrl: "https://www.nin.res.in",
    description: "Indian dietary guidelines and nutrition research",
  },
  {
    organization: "Indian Council of Medical Research (ICMR)",
    domain: "icmr.gov.in",
    baseUrl: "https://www.icmr.gov.in",
    description: "Indian medical research and clinical guidelines",
  },
  {
    organization: "National Health Service (NHS)",
    domain: "nhs.uk",
    baseUrl: "https://www.nhs.uk",
    description: "UK national health service information",
  },
  {
    organization: "MedlinePlus (NIH)",
    domain: "medlineplus.gov",
    baseUrl: "https://medlineplus.gov",
    description: "US National Library of Medicine consumer health information",
  },
  {
    organization: "DailyMed (NIH)",
    domain: "dailymed.nlm.nih.gov",
    baseUrl: "https://dailymed.nlm.nih.gov",
    description: "Official drug label information from the FDA",
  },
];

/**
 * Check if a URL belongs to an approved reference domain.
 */
export function isApprovedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return APPROVED_REFERENCES.some((ref) => hostname.endsWith(ref.domain));
  } catch {
    return false;
  }
}

/**
 * Get the reference info for an approved domain.
 */
export function getReferenceForDomain(
  url: string
): ApprovedReference | null {
  try {
    const hostname = new URL(url).hostname;
    return (
      APPROVED_REFERENCES.find((ref) => hostname.endsWith(ref.domain)) || null
    );
  } catch {
    return null;
  }
}

/**
 * Standard safety response for when authoritative references cannot be retrieved.
 */
export const NO_REFERENCE_RESPONSE =
  "I cannot retrieve a verified health reference right now, so I will not generate health guidance without evidence. " +
  "For general health questions, please consult a healthcare professional or refer to official sources such as " +
  "WHO (who.int), ICMR-NIN (nin.res.in), or NHS (nhs.uk).";
