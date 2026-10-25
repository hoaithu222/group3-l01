/** Đoạn khớp theo UTF-16 CODE UNIT của chính chuỗi được tô (cùng nghĩa `highlights` của BE p1-09/p5-04). */
export interface TextHighlight {
  start: number;
  end: number;
}

export interface TextSegment {
  text: string;
  highlighted: boolean;
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * Cắt `snippet` thành các đoạn thường/nổi bật theo `highlights` (BE tính theo UTF-16 CODE UNIT của chính snippet —
 * dùng thẳng với `slice`, KHÔNG đổi sang grapheme/code point, be.md p1-09 §2 "Snippet").
 *
 * Phòng thủ (dữ liệu tới từ server, một đoạn sai không được làm vỡ cả hàng kết quả):
 *  · bỏ đoạn không hữu hạn/không nguyên/rỗng, kẹp vào `[0, length]`, sắp và GỘP đoạn chồng nhau;
 *  · không bao giờ cắt GIỮA một cặp surrogate (emoji ngoài BMP như "🙂"): biên rơi vào giữa cặp thì nới ra cho tròn
 *    cặp — cắt giữa cặp ra hai ký tự lỗi "�" và `<Text>` in cả hai.
 * Ghép lại mọi đoạn luôn cho đúng `text` gốc.
 *
 * Nâng lên `shared/` ở p5-04 vì cả `discovery` (tìm trong kênh) lẫn `workspace-search` (tìm toàn nhóm) cùng dùng — hai
 * feature không được import chéo nhau (`docs/rules/feature-structure.md`).
 */
export function splitByHighlights(
  text: string,
  highlights: readonly TextHighlight[],
): TextSegment[] {
  if (text.length === 0) return [];

  const ranges = highlights
    .filter((h) => Number.isInteger(h.start) && Number.isInteger(h.end))
    .map((h) => ({ start: Math.max(0, h.start), end: Math.min(text.length, h.end) }))
    .filter((h) => h.start < h.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const { start, end } = snapToCodePoints(text, range);
    const last = merged[merged.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else merged.push({ start, end });
  }

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const { start, end } of merged) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), highlighted: false });
    segments.push({ text: text.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlighted: false });
  return segments;
}

function snapToCodePoints(
  text: string,
  range: { start: number; end: number },
): { start: number; end: number } {
  let { start, end } = range;
  if (
    start > 0 &&
    isLowSurrogate(text.charCodeAt(start)) &&
    isHighSurrogate(text.charCodeAt(start - 1))
  )
    start -= 1;
  if (
    end < text.length &&
    isLowSurrogate(text.charCodeAt(end)) &&
    isHighSurrogate(text.charCodeAt(end - 1))
  )
    end += 1;
  return { start, end };
}
