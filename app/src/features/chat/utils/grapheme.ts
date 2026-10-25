/**
 * Đếm/cắt theo GRAPHEME (ký tự người dùng NHÌN THẤY là một chữ, kể cả emoji
 * ghép ZWJ như "👨‍👩‍👧") — khớp BE `graphemeLength()` (`core/utils/normalize.ts`,
 * cũng `Intl.Segmenter`). Dùng cho đếm 4.000 ký tự của Composer (`CHAT_LIMITS.maxChars`)
 * và cắt excerpt (app.md §4.3 `preview-text.ts`).
 *
 * ⚠️ Hermes (JS engine của Expo/React Native) hỗ trợ `Intl.Segmenter` KHÔNG
 * chắc chắn ở mọi bản/cấu hình — app.md §2 tự gọi đây là "Intl.Segmenter
 * (fallback)". Fallback dùng `Array.from(text)` (tách theo CODE POINT, qua
 * iterator chuỗi chuẩn — đúng cho hầu hết emoji đơn/ký tự có dấu, chỉ XẤP XỈ
 * cho emoji ghép ZWJ vì mỗi code point trong chuỗi ghép bị đếm riêng) thay vì
 * `text.length` (sai cả với ký tự ngoài BMP, chứ không chỉ ZWJ).
 */
type SegmenterCtor = new (locale: string, options: { granularity: 'grapheme' }) => {
  segment: (text: string) => Iterable<unknown>;
};

function getSegmenterCtor(): SegmenterCtor | undefined {
  return (Intl as typeof Intl & { Segmenter?: SegmenterCtor }).Segmenter;
}

function toGraphemeArray(text: string): string[] {
  const Segmenter = getSegmenterCtor();
  if (Segmenter) {
    const segmenter = new Segmenter('vi', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (s) => String((s as { segment: string }).segment));
  }
  return Array.from(text);
}

export function graphemeLength(text: string): number {
  return toGraphemeArray(text).length;
}

/** Cắt về TỐI ĐA `max` grapheme, thêm "…" nếu bị cắt (không cắt giữa emoji ghép). */
export function truncateGraphemes(text: string, max: number): string {
  const graphemes = toGraphemeArray(text);
  if (graphemes.length <= max) return text;
  return `${graphemes.slice(0, max).join('')}…`;
}
