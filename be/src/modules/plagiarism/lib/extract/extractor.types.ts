/**
 * Hợp đồng trích văn bản — CHỖ CẮM của bước sau (be.md §1 `lib/extract/*`). Thư viện thuần này chỉ định nghĩa hợp đồng và
 * hai trình trích không cần thư viện ngoài (TXT/MD/mã nguồn). PDF (thư viện đọc PDF dùng chung với `print.count-pages`
 * của p6-05) và DOCX (`mammoth` raw text) cài đặt CÙNG interface này ở bước sau rồi đăng ký theo `TextExtractorId`.
 *
 * Bước lập chỉ mục (job `plagiarism.fingerprint`) dùng: `classifyFile(name)` → `extractor.extract({ buffer, charsMax })` →
 * (PDF: `stripRepeatedPageLines` + `assessTextQuality`) → `tokenizeText`/`tokenizeCode` → `fingerprintText`/`fingerprintCode`.
 */

export type TextExtractorId = "pdf" | "docx" | "plain" | "markdown";

export interface TextExtractionInput {
  /** Toàn bộ nội dung tệp (đã kiểm `size ≤ fileBytesMax` ở caller — 20 MiB nên nạp một lần là chấp nhận được). */
  buffer: Buffer;
  /** Trần số ký tự văn bản trả về (`LIMITS.plagiarism.charsMax`); vượt thì cắt và `truncated = true`. */
  charsMax: number;
}

export type TextExtractionResult =
  /** `text`: văn bản trích ra, "\n" là ngắt dòng, offset mọi đoạn trùng về sau tính trên CHÍNH chuỗi này (lưu vào tệp dẫn xuất). */
  | { ok: true; text: string; truncated: boolean }
  /** `NO_TEXT`: không có chữ dùng được (PDF ảnh quét, tệp rỗng) — không OCR; `FAILED`: tệp hỏng/không đọc được. */
  | { ok: false; reason: "NO_TEXT" | "FAILED" };

export interface TextExtractor {
  readonly id: TextExtractorId;
  extract(input: TextExtractionInput): Promise<TextExtractionResult>;
}
