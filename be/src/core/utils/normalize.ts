/**
 * Chuẩn hoá chuỗi tiếng Việt cho tìm kiếm không dấu, không phân biệt hoa/thường.
 * - NFC → NFD tách dấu, xoá dải combining diacritics (U+0300–U+036F)
 * - `đ`/`Đ` → `d`/`D` (không nằm trong dải combining diacritics ở trên)
 * - Gộp khoảng trắng thừa, trim
 */
export function normalizeSearch(input: string): string {
  return input
    .normalize("NFC")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * (p6-06) Chuẩn hoá NHÃN KỸ NĂNG để so khớp `SkillDefinition.labelMatch`: `normalizeSearch` (bỏ dấu, chữ thường) rồi bỏ MỌI ký tự không
 * phải chữ/số — "Node.js", "node js", "NODEJS" → `nodejs`; "React JS" → `reactjs`; "Cơ sở dữ liệu" → `cosodulieu`. `+`/`#` đổi thành
 * `plus`/`sharp` trước khi bỏ để "C++", "C#" không cùng rơi về `c`. Chuỗi rỗng sau chuẩn hoá = không khớp gì.
 */
export function normalizeSkillLabel(label: string): string {
  return normalizeSearch(label)
    .replace(/\+/g, "plus")
    .replace(/#/g, "sharp")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Đếm số grapheme (ký tự hiển thị) thay vì code unit — 1 emoji ghép (ZWJ) vẫn
 * tính là 1, khác với `string.length` (UTF-16 code units).
 */
export function graphemeLength(s: string): number {
  const seg = new Intl.Segmenter("vi", { granularity: "grapheme" });
  return Array.from(seg.segment(s)).length;
}
