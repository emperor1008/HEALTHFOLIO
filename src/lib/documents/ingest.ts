/**
 * Document ingestion pipeline.
 * Extracts text from PDFs and images, then classifies and extracts structured data.
 */

export interface ExtractedPageText {
  pageNumber: number;
  text: string;
  confidence: number;
  method: "pdf_text" | "ocr" | "vision";
}

export interface IngestionResult {
  documentId: string;
  pageCount: number;
  pages: ExtractedPageText[];
  totalTextLength: number;
}

/**
 * Extract text from a PDF buffer using pdf-parse.
 */
export async function extractPdfText(
  buffer: Buffer
): Promise<ExtractedPageText[]> {
  const pdfParse = (await import("pdf-parse")).default;
  const pages: ExtractedPageText[] = [];

  try {
    const data = await pdfParse(buffer, {
      max: 50, // Limit page count
    });

    // pdf-parse extracts all text as one block; we split by page
    // For multi-page PDFs, we use the internal page info
    if (data.numpages === 1) {
      pages.push({
        pageNumber: 1,
        text: data.text,
        confidence: 0.95,
        method: "pdf_text",
      });
    } else {
      // Split text roughly by page count
      const linesPerPage = Math.ceil(data.text.split("\n").length / data.numpages);
      const allLines = data.text.split("\n");

      for (let i = 0; i < data.numpages; i++) {
        const pageLines = allLines.slice(
          i * linesPerPage,
          (i + 1) * linesPerPage
        );
        const pageText = pageLines.join("\n").trim();

        if (pageText.length > 10) {
          pages.push({
            pageNumber: i + 1,
            text: pageText,
            confidence: pageText.length > 100 ? 0.9 : 0.6,
            method: "pdf_text",
          });
        } else {
          pages.push({
            pageNumber: i + 1,
            text: "",
            confidence: 0,
            method: "pdf_text",
          });
        }
      }
    }
  } catch (error) {
    throw new Error("PDF parsing failed. The document may be corrupted or password-protected.");
  }

  return pages;
}

/**
 * Extract text from an image using OCR (Tesseract.js).
 */
export async function extractImageText(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractedPageText[]> {
  try {
    const Tesseract = await import("tesseract.js");

    const {
      data: { text, confidence },
    } = await Tesseract.recognize(buffer, "eng", {});

    return [
      {
        pageNumber: 1,
        text: text.trim(),
        confidence: confidence / 100,
        method: "ocr",
      },
    ];
  } catch {
    return [
      {
        pageNumber: 1,
        text: "",
        confidence: 0,
        method: "ocr",
      },
    ];
  }
}

/**
 * Process a document buffer and extract text from all pages.
 */
export async function processDocument(
  buffer: Buffer,
  mimeType: string
): Promise<IngestionResult> {
  let pages: ExtractedPageText[];

  if (mimeType === "application/pdf") {
    pages = await extractPdfText(buffer);
  } else if (mimeType === "image/png" || mimeType === "image/jpeg") {
    pages = await extractImageText(buffer, mimeType);
  } else {
    throw new Error("Unsupported document type");
  }

  return {
    documentId: "",
    pageCount: pages.length,
    pages,
    totalTextLength: pages.reduce((sum, p) => sum + p.text.length, 0),
  };
}
