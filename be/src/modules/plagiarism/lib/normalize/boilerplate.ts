import type { Token } from "../types";
import { tokenizeText } from "./text-normalizer";

/**
 * Bỏ các token thuộc cụm câu mẫu do admin khai (`SystemConfig plagiarism.boilerplatePhrases`, be.md §5.1 bước 5): mỗi cụm
 * được tách token BẰNG CHÍNH `tokenizeText` nên so trên dạng chuẩn hoá (khác dấu/hoa thường/dấu câu vẫn khớp). Chỉ lọc
 * token, không đổi offset của token còn lại — token giữ nguyên `start/end` trong văn bản gốc; chỉ số token của phần còn lại
 * dịch lại, nên tệp dẫn xuất PHẢI lưu bảng offset của danh sách ĐÃ LỌC (cùng danh sách dùng để băm).
 *
 * Nhiều cụm khớp tại cùng một chỗ → lấy cụm dài nhất. Cụm rỗng sau chuẩn hoá bị bỏ qua. Token thuộc cụm là token bị bỏ.
 */
export function removeBoilerplatePhrases(tokens: readonly Token[], phrases: readonly string[]): Token[] {
  const byFirst = new Map<string, string[][]>();
  for (const phrase of phrases) {
    const words = tokenizeText(phrase).map((t) => t.value);
    if (words.length === 0) continue;
    const list = byFirst.get(words[0]);
    if (list) list.push(words);
    else byFirst.set(words[0], [words]);
  }
  if (byFirst.size === 0) return [...tokens];
  for (const list of byFirst.values()) list.sort((a, b) => b.length - a.length);

  const out: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const candidates = byFirst.get(tokens[i].value);
    const hit = candidates?.find((words) => words.every((w, j) => tokens[i + j]?.value === w));
    if (hit) i += hit.length;
    else out.push(tokens[i++]);
  }
  return out;
}
