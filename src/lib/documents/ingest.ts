/**
 * Document ingestion pipeline.
 * Extracts text from PDFs and images, then classifies and extracts structured data.
 */

/**
 * Validate file magic bytes to confirm extension matches actual content.
 */
export function validateFileSignature(
  buffer: Buffer,
  declaredMimeType: string
): { valid: boolean; detectedType?: string; error?: string } {
  if (buffer.length < 4) {
    return { valid: false, error: "File too small to validate." };
  }

  const header = buffer.subarray(0, 8);

  // PDF: %PDF
  const isPdf =
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46;

  // PNG: \x89PNG\r\n\x1a\n
  const isPng =
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47;

  // JPEG: \xff\xd8\xff
  const isJpeg =
    header[0] === 0xff &&
    header[1] === 0xd8 &&
    header[2] === 0xff;

  // RIFF....WEBP (WEBP: bytes 0-3 = "RIFF", 8-11 = "WEBP")
  const isWebp =
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    buffer.length > 11 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50;

  let detectedType: string | null = null;
  if (isPdf) detectedType = "application/pdf";
  else if (isPng) detectedType = "image/png";
  else if (isJpeg) detectedType = "image/jpeg";
  else if (isWebp) detectedType = "image/webp";

  // Detect HTML/SVG masquerading as other types
  const headerStr = buffer.subarray(0, 100).toString("utf-8").toLowerCase();
  if (
    headerStr.includes("<html") ||
    headerStr.includes("<svg") ||
    headerStr.includes("<script") ||
    headerStr.includes("<!doctype")
  ) {
    return {
      valid: false,
      error: "HTML/SVG content is not a supported document type.",
    };
  }

  if (!detectedType) {
    return {
      valid: false,
      error: "File format could not be verified. Upload a PDF, PNG, JPEG, or WEBP.",
    };
  }

  if (detectedType !== declaredMimeType) {
    return {
      valid: false,
      error: `File content does not match its extension. Detected ${detectedType}, expected ${declaredMimeType}.`,
    };
  }

  return { valid: true, detectedType };
}

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
 * If extraction yields no text (scanned PDF), returns empty pages
 * so the caller can fall back to image OCR.
 */
export async function extractPdfText(
  buffer: Buffer
): Promise<ExtractedPageText[]> {
  const pdfParse = (await import("pdf-parse")).default;
  const pages: ExtractedPageText[] = [];

  try {
    const data = await pdfParse(buffer, {
      max: 50,
    });

    if (data.numpages === 1) {
      pages.push({
        pageNumber: 1,
        text: data.text,
        confidence: 0.95,
        method: "pdf_text",
      });
    } else {
      // Split text roughly by page count
      const linesPerPage = Math.ceil(
        data.text.split("\n").length / data.numpages
      );
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
  } catch {
    throw new Error(
      "PDF parsing failed. The document may be corrupted or password-protected."
    );
  }

  return pages;
}

/**
 * Extract text from an image using OCR (Tesseract.js).
 */
export async function extractImageText(
  buffer: Buffer,
  _mimeType: string
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
 * Convert a PDF page to an image buffer using sharp (for scanned PDFs).
 * Attempts to render the first page as a PNG for OCR fallback.
 */
async function convertPdfPageToImage(
  _buffer: Buffer,
  _pageNumber: number
): Promise<Buffer | null> {
  try {
    // Use sharp to convert the PDF buffer to a PNG image
    // sharp can handle PDF input natively
    const sharp = (await import("sharp")).default;
    const imageBuffer = await sharp(_buffer, {
      page: _pageNumber - 1, // 0-indexed
      density: 300, // High DPI for better OCR
    })
      .png()
      .toBuffer();

    return imageBuffer;
  } catch {
    return null;
  }
}

/**
 * Check if a PDF is likely a scanned document (very little text per page).
 */
function isScannedPdf(pages: ExtractedPageText[]): boolean {
  if (pages.length === 0) return true;
  const avgTextLength =
    pages.reduce((sum, p) => sum + p.text.length, 0) / pages.length;
  return avgTextLength < 50;
}

/**
 * Process a document buffer and extract text from all pages.
 * For scanned PDFs, converts pages to images and runs OCR.
 */
export async function processDocument(
  buffer: Buffer,
  mimeType: string
): Promise<IngestionResult> {
  let pages: ExtractedPageText[];

  if (mimeType === "application/pdf") {
    pages = await extractPdfText(buffer);

    // If PDF has little text (scanned document), try OCR fallback
    if (isScannedPdf(pages)) {
      const ocrPages: ExtractedPageText[] = [];

      for (let i = 0; i < pages.length; i++) {
        const imageBuffer = await convertPdfPageToImage(buffer, i + 1);
        if (imageBuffer) {
          const ocrResult = await extractImageText(imageBuffer, "image/png");
          if (ocrResult[0].text.length > 10) {
            ocrPages.push({
              pageNumber: i + 1,
              text: ocrResult[0].text,
              confidence: ocrResult[0].confidence,
              method: "ocr",
            });
            continue;
          }
        }
        // Keep original (empty) page if OCR fails
        ocrPages.push(pages[i]);
      }

      pages = ocrPages;
    }
  } else if (
    mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/webp"
  ) {
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
