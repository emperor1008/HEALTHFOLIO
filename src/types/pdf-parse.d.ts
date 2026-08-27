declare module "pdf-parse" {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }

  interface PDFOptions {
    pagerender?: (pageData: unknown) => string;
    max?: number;
    version?: string;
  }

  function pdfParse(
    dataBuffer: Buffer,
    options?: PDFOptions
  ): Promise<PDFData>;

  export default pdfParse;
}
