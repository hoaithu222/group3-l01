import mammoth from "mammoth";
import type { TextExtractionInput, TextExtractionResult, TextExtractor } from "./extractor.types";
import { capText } from "./plain.extractor";

/**
 * Trích văn bản thô từ DOCX bằng `mammoth.extractRawText` (README §2: "DOCX (`mammoth` raw text)") — bỏ mọi định dạng,
 * chỉ giữ chữ hiển thị (đoạn văn nối bằng "\n"). Không xử lý bảng/chú thích chân trang riêng — nội dung của chúng đã nằm
 * trong luồng văn bản do mammoth trả về. Tệp hỏng/không phải DOCX (zip lỗi) → `FAILED`; rỗng → `NO_TEXT`.
 */
export const docxExtractor: TextExtractor = {
  id: "docx",
  async extract(input: TextExtractionInput): Promise<TextExtractionResult> {
    let value: string;
    try {
      const result = await mammoth.extractRawText({ buffer: input.buffer });
      value = result.value;
    } catch {
      return { ok: false, reason: "FAILED" };
    }
    const normalized = value.replace(/\r\n?/g, "\n");
    if (normalized.trim() === "") return { ok: false, reason: "NO_TEXT" };
    const { text, truncated } = capText(normalized, input.charsMax);
    return { ok: true, text, truncated };
  },
};
