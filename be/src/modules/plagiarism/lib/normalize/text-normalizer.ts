import { normalizeSearch } from "../../../../core/utils/normalize";
import type { Token } from "../types";

/**
 * Chuẩn hoá + tách token cho VĂN BẢN THƯỜNG (README §2 "Chuẩn hoá văn bản"): NFC → bỏ dấu tiếng Việt (`normalizeSearch`,
 * kể cả đ→d) → chữ thường → bỏ dấu câu → gộp khoảng trắng. Mục đích là bắt cách lách "bỏ dấu" / "đổi hoa thường" / "thêm
 * bớt dấu câu" (PLAG-11); mỗi token là một "từ" = dãy chữ/số liên tục.
 *
 * Vì sao tách theo dãy chữ/số trên CHUỖI GỐC thay vì chuẩn hoá cả chuỗi rồi mới tách: offset của token phải trỏ về văn bản
 * người dùng đang xem (tô sáng đoạn trùng). Chuẩn hoá cả chuỗi làm độ dài đổi (NFD/NFC, ligature "ﬁ"→"fi") nên phải dựng
 * bản đồ vị trí; còn ở đây `\p{M}` (dấu tổ hợp) nằm TRONG dãy từ nên "Việt" ở dạng NFD vẫn là một token có offset đúng.
 */
const WORD = /[\p{L}\p{N}\p{M}]+/gu;
const NON_WORD = /[^\p{L}\p{N}]/gu;

/**
 * Dạng chuẩn hoá của MỘT từ. NFKC (thay vì chỉ NFC của kế hoạch) để ligature/full-width mà trích PDF hay sinh ra
 * ("ﬁnal", "ｆｕｌｌ") vẫn khớp bản DOCX/TXT — NFKC đã bao gồm việc ghép tổ hợp của NFC; offset không bị ảnh hưởng vì
 * việc này chỉ áp lên giá trị token, không áp lên chuỗi gốc. Ký tự còn sót không phải chữ/số sau NFKC (vd "½" → "1⁄2")
 * bị bỏ.
 */
export function foldWord(word: string): string {
  return normalizeSearch(word.normalize("NFKC")).replace(NON_WORD, "");
}

/** Tách văn bản thành token đã chuẩn hoá kèm offset trong `text` gốc. Rỗng/toàn dấu câu → `[]`. Không ném lỗi. */
export function tokenizeText(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(WORD)) {
    const value = foldWord(m[0]);
    if (value === "") continue;
    const start = m.index;
    tokens.push({ value, start, end: start + m[0].length });
  }
  return tokens;
}

/** Bản chuỗi chuẩn hoá của cả văn bản (token nối bằng một dấu cách) — để so sánh/gỡ lỗi; đường lập chỉ mục dùng `tokenizeText`. */
export function normalizeText(text: string): string {
  return tokenizeText(text)
    .map((t) => t.value)
    .join(" ");
}
