import { PDFParse } from "pdf-parse";
import { PLAGIARISM_DEFAULTS } from "../constants";
import { stripRepeatedPageLines } from "../normalize/page-lines";
import type { TextExtractionInput, TextExtractionResult, TextExtractor } from "./extractor.types";
import { capText } from "./plain.extractor";

/**
 * Trích văn bản PDF có lớp chữ (README §2, be.md §5.1 bước 3) bằng `pdf-parse` v2 (lớp `PDFParse`, bọc pdf.js — không cần
 * canvas/binding native). KHÔNG OCR: PDF ảnh quét (không lớp chữ) → gần như 0 ký tự → `assessTextQuality` (gọi bởi
 * `fingerprint-index.service` NGAY SAU khi extractor trả `ok`) quyết định `NO_TEXT`. Header/footer lặp ≥ 50% số trang bị
 * xoá NGAY TRONG extractor này (be.md §2 "loại dòng header/footer lặp") vì cần biết ranh giới trang — thứ mà
 * `TextExtractionResult` (chỉ có `text` phẳng) không còn giữ được sau bước này.
 */
export const pdfExtractor: TextExtractor = {
  id: "pdf",
  async extract(input: TextExtractionInput): Promise<TextExtractionResult> {
    let parser: PDFParse | null = null;
    try {
      parser = new PDFParse({ data: input.buffer });
      const result = await parser.getText();
      const pageTexts = result.pages.map((p) => p.text);
      const stripped = stripRepeatedPageLines(pageTexts, {
        minPageRatio: PLAGIARISM_DEFAULTS.headerFooterMinPageRatio,
        edgeLines: PLAGIARISM_DEFAULTS.headerFooterEdgeLines,
      });
      const joined = stripped.join("\n").replace(/\r\n?/g, "\n");
      if (joined.trim() === "") return { ok: false, reason: "NO_TEXT" };
      const { text, truncated } = capText(joined, input.charsMax);
      return { ok: true, text, truncated };
    } catch {
      return { ok: false, reason: "FAILED" };
    } finally {
      if (parser) await parser.destroy().catch(() => undefined);
    }
  },
};
