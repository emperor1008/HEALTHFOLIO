/**
 * Healthfolio Capabilities Registry
 *
 * Single source of truth for what Healthfolio can genuinely do.
 * Used by the Ask Healthfolio assistant to answer product-help questions.
 * This is application documentation, not dummy medical data.
 */

export interface Capability {
  id: string;
  category: "upload" | "process" | "review" | "timeline" | "assistant" | "prepare" | "export" | "privacy";
  keywords: string[];
  shortDescription: string;
  detailedDescription: string;
}

export const CAPABILITIES: Capability[] = [
  {
    id: "overview",
    category: "upload",
    keywords: ["healthfolio", "what is healthfolio", "what does healthfolio"],
    shortDescription: "Healthfolio organizes medical records and prepares consultations.",
    detailedDescription:
      "Healthfolio is a medical record organizer and consultation preparation assistant. " +
      "You can upload prescriptions, lab reports, and scan images; have them processed with OCR and AI; " +
      "review extracted information; build a verified timeline; ask questions about your records; " +
      "prepare for appointments with briefs, checklists, and calendar exports.",
  },
  {
    id: "upload",
    category: "upload",
    keywords: ["upload", "add", "submit", "file", "document", "record", "report", "prescription", "image"],
    shortDescription: "Upload PDF, PNG, JPEG, and WEBP medical documents up to 10 MB each.",
    detailedDescription:
      "Healthfolio accepts PDF files, PNG images, JPEG images, and WEBP images up to 10 MB each. " +
      "To upload, go to the Records page and click 'Upload records'. Select your files, then click " +
      "'Analyze records' to start processing. Each file is validated for size, format, and file signature " +
      "before secure storage.",
  },
  {
    id: "ocr",
    category: "process",
    keywords: ["ocr", "read", "scan", "scanned", "image", "text extraction", "extract text", "tesseract"],
    shortDescription: "Extract text from PDFs and images using OCR (Tesseract.js).",
    detailedDescription:
      "Healthfolio extracts text from text-based PDFs directly. For scanned PDFs and images, " +
      "it uses Tesseract.js OCR to read the text. Low-confidence extractions are flagged for " +
      "your review. You can correct OCR text if it was not read accurately.",
  },
  {
    id: "classify",
    category: "process",
    keywords: ["classify", "type", "categorize", "what kind", "document type"],
    shortDescription: "Classify documents as prescriptions, lab reports, discharge summaries, and more.",
    detailedDescription:
      "Healthfolio uses AI to classify each uploaded document into categories such as prescription, " +
      "lab report, imaging report, discharge summary, consultation record, vaccination record, " +
      "insurance document, or other medical document.",
  },
  {
    id: "extract",
    category: "process",
    keywords: ["extract", "structured", "facts", "information", "data"],
    shortDescription: "Extract structured medical facts with source evidence and confidence scores.",
    detailedDescription:
      "Healthfolio extracts structured facts from each document, including dates, test names, " +
      "results, medicine names, dosages, clinician names, and instructions. Each fact includes " +
      "the source document, page number, evidence text, and a confidence score.",
  },
  {
    id: "review",
    category: "review",
    keywords: ["review", "confirm", "correct", "reject", "uncertain", "low confidence", "verify"],
    shortDescription: "Review uncertain extractions and confirm, correct, or reject them.",
    detailedDescription:
      "Healthfolio shows you any extracted information that has low confidence, conflicts with " +
      "another document, or requires confirmation. For each uncertain item, you can confirm it " +
      "is correct, correct the value, reject it, or upload a clearer copy of the document.",
  },
  {
    id: "timeline",
    category: "timeline",
    keywords: ["timeline", "chronological", "history", "events", "when", "date"],
    shortDescription: "Build a verified chronological health timeline from confirmed records.",
    detailedDescription:
      "Healthfolio organizes your verified and confirmed medical facts into a chronological " +
      "timeline. Each event links back to its source document and page. You can click any " +
      "timeline event to view the original document and evidence.",
  },
  {
    id: "ask",
    category: "assistant",
    keywords: ["ask question", "chat with", "assistant", "ask about"],
    shortDescription: "Ask questions about your uploaded medical records and get cited answers.",
    detailedDescription:
      "The Ask Healthfolio assistant answers questions using only your uploaded documents. " +
      "Every answer cites the source document, page number, and evidence text. " +
      "It can summarize reports, list recorded medicines, compare documents, " +
      "and find contradictions across your records.",
  },
  {
    id: "brief",
    category: "prepare",
    keywords: ["brief", "consultation", "prepare", "appointment", "summary"],
    shortDescription: "Generate a consultation preparation brief from verified records.",
    detailedDescription:
      "Healthfolio generates a consultation brief summarizing your verified medical records " +
      "relevant to an upcoming appointment. The brief includes a chronological summary, " +
      "source citations, and preparation notes.",
  },
  {
    id: "checklist",
    category: "prepare",
    keywords: ["checklist", "documents to carry", "bring", "list"],
    shortDescription: "Generate a document checklist for your next appointment.",
    detailedDescription:
      "Healthfolio creates a checklist of documents and information to bring to your " +
      "next medical appointment based on your uploaded records and appointment details.",
  },
  {
    id: "questions",
    category: "prepare",
    keywords: ["questions", "ask doctor", "discuss", "clinician"],
    shortDescription: "Generate neutral questions to discuss with your doctor.",
    detailedDescription:
      "Healthfolio suggests neutral, source-backed questions you may want to discuss " +
      "with your healthcare provider. These are not medical recommendations — they help " +
      "you prepare for a productive conversation.",
  },
  {
    id: "pdf-export",
    category: "export",
    keywords: ["pdf", "download", "export", "brief pdf"],
    shortDescription: "Export your consultation brief as a downloadable PDF.",
    detailedDescription:
      "Healthfolio can generate a professional PDF of your consultation brief, " +
      "including verified timeline events, source citations, and preparation notes.",
  },
  {
    id: "ics-export",
    category: "export",
    keywords: ["calendar", "ics", "reminder", "appointment reminder", "add to calendar"],
    shortDescription: "Export appointment details as an ICS calendar file.",
    detailedDescription:
      "Healthfolio generates a standards-compliant .ics calendar file for your appointment " +
      "that you can import into Google Calendar, Apple Calendar, Outlook, or any calendar app.",
  },
  {
    id: "privacy",
    category: "privacy",
    keywords: ["privacy", "security", "data", "safe", "storage", "delete", "protected"],
    shortDescription: "Your data is stored privately with Row-Level Security and never shared.",
    detailedDescription:
      "Healthfolio stores your documents in private, user-scoped storage. " +
      "Row-Level Security ensures only you can access your records. " +
      "Documents are accessed through short-lived signed URLs — no permanent public links. " +
      "You can delete your account and all associated data at any time from Settings.",
  },
];

/**
 * Answer a product-help question using the capability registry.
 * Returns null if the question doesn't match any known capability.
 */
export function answerProductHelp(question: string): {
  answer: string;
  matchedCapabilities: string[];
} | null {
  const lowerQ = question.toLowerCase();
  const matched: Capability[] = [];

  for (const cap of CAPABILITIES) {
    const score = cap.keywords.filter((kw) => lowerQ.includes(kw)).length;
    if (score > 0) {
      matched.push({ ...cap, _score: score } as Capability & { _score: number });
    }
  }

  if (matched.length === 0) return null;

  // Sort by keyword match score
  matched.sort(
    (a, b) =>
      ((b as unknown as { _score: number })._score) -
      ((a as unknown as { _score: number })._score)
  );

  // Build answer from top matches (at most 3)
  const top = matched.slice(0, 3);
  const answerParts = top.map((cap) => cap.detailedDescription);

  return {
    answer: answerParts.join("\n\n"),
    matchedCapabilities: top.map((c) => c.id),
  };
}
