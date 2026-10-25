import { PLAGIARISM_DEFAULTS } from "../constants";
import { tokenizeText } from "../normalize/text-normalizer";

export interface TextQualityOptions {
  minWords?: number;
  minValidCharRatio?: number;
}

export interface TextQuality {
  /** `true` = đủ chữ dùng được để lập chỉ mục; `false` → caller đặt `NO_TEXT`. */
  ok: boolean;
  words: number;
  /** Tỉ lệ (0–1) ký tự chữ/số/dấu tổ hợp trên tổng ký tự khác khoảng trắng. */
  validCharRatio: number;
  reason?: "TOO_FEW_WORDS" | "LOW_VALID_CHAR_RATIO";
}

/**
 * Kiểm chất lượng văn bản trích ra từ PDF (be.md §5.1 bước 3, README §10): PDF ảnh quét không có lớp chữ cho ~0 từ; PDF lỗi
 * font tiếng Việt cho rất nhiều ký tự lạ/thay thế nên tỉ lệ chữ-số hợp lệ tụt dưới 60 %. Cả hai → `NO_TEXT` (không OCR, PLAG-08).
 * Quy tắc "< 50 từ" là của PDF trong kế hoạch — caller quyết định có áp cho loại tệp khác hay không.
 */
export function assessTextQuality(text: string, options: TextQualityOptions = {}): TextQuality {
  const minWords = options.minWords ?? PLAGIARISM_DEFAULTS.minPdfWords;
  const minRatio = options.minValidCharRatio ?? PLAGIARISM_DEFAULTS.minValidCharRatio;
  const compact = text.replace(/\s+/g, "");
  let valid = 0;
  for (const run of compact.matchAll(/[\p{L}\p{N}\p{M}]+/gu)) valid += run[0].length;
  const validCharRatio = compact.length > 0 ? valid / compact.length : 0;
  const words = tokenizeText(text).length;
  if (words < minWords) return { ok: false, words, validCharRatio, reason: "TOO_FEW_WORDS" };
  if (validCharRatio < minRatio) return { ok: false, words, validCharRatio, reason: "LOW_VALID_CHAR_RATIO" };
  return { ok: true, words, validCharRatio };
}
