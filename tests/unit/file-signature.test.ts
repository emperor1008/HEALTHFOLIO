import { describe, it, expect } from "vitest";
import { validateFileSignature } from "@/lib/documents/ingest";

describe("validateFileSignature", () => {
  it("should accept valid PDF files", () => {
    // PDF magic bytes: %PDF
    const buffer = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, // %PDF-1.4
      0x0a, 0x31, 0x20, 0x30, 0x20, 0x6f, 0x62, 0x6a,
    ]);
    const result = validateFileSignature(buffer, "application/pdf");
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("application/pdf");
  });

  it("should accept valid PNG files", () => {
    // PNG magic bytes: \\x89PNG\\r\\n\\x1a\\n
    const buffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    const result = validateFileSignature(buffer, "image/png");
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("image/png");
  });

  it("should accept valid JPEG files", () => {
    // JPEG magic bytes: \\xff\\xd8\\xff
    const buffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
      0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    ]);
    const result = validateFileSignature(buffer, "image/jpeg");
    expect(result.valid).toBe(true);
    expect(result.detectedType).toBe("image/jpeg");
  });

  it("should reject PDF extension with PNG content", () => {
    const buffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    const result = validateFileSignature(buffer, "application/pdf");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("does not match");
  });

  it("should reject HTML content masquerading as PDF", () => {
    const buffer = Buffer.from(
      "<html><head><title>fake</title></head><body>malicious</body></html>"
    );
    const result = validateFileSignature(buffer, "application/pdf");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("HTML/SVG");
  });

  it("should reject SVG content masquerading as image", () => {
    const buffer = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    );
    const result = validateFileSignature(buffer, "image/png");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("HTML/SVG");
  });

  it("should reject files that are too small", () => {
    const buffer = Buffer.from([0x00]);
    const result = validateFileSignature(buffer, "application/pdf");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too small");
  });

  it("should reject unrecognized file types", () => {
    // Random bytes that don't match any known signature
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    const result = validateFileSignature(buffer, "image/jpeg");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("could not be verified");
  });

  it("should reject script injection in file content", () => {
    const buffer = Buffer.from(
      "<!DOCTYPE html><script>alert('xss')</script>"
    );
    const result = validateFileSignature(buffer, "application/pdf");
    expect(result.valid).toBe(false);
  });
});
