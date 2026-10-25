import type { SpanRange, Token } from "../types";

/**
 * Offset bắt đầu của từng dòng trong `text` (phần tử đầu luôn là 0; mỗi "\n" mở một dòng mới). Đây chính là mảng
 * `lineBreaks` của tệp dẫn xuất (README §4) — lưu một lần, tra số dòng bằng tìm nhị phân, không quét lại văn bản.
 * Chỉ "\n" là ngắt dòng: trình trích văn bản phải đổi "\r\n"/"\r" về "\n" trước (xem `decodeTextBuffer`).
 */
export function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  return starts;
}

/** Số dòng (đánh số từ 1) chứa ký tự tại `offset`; offset âm coi như 0, quá cuối coi như dòng cuối. */
export function lineNumberAt(lineStarts: readonly number[], offset: number): number {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * Đổi khoảng token [startToken, endToken) sang `SpanRange` (token + ký tự + dòng) để lưu vào `PlagiarismSection`. Ký tự lấy
 * từ offset của token đầu/cuối trong VĂN BẢN GỐC; `lineEnd` là dòng chứa ký tự cuối cùng của đoạn (không phải dòng chứa
 * offset `endChar`, vốn nằm ngay sau đoạn). Khoảng rỗng/ngoài phạm vi là lỗi lập trình → `RangeError`.
 */
export function toSpanRange(
  tokens: readonly Token[],
  lineStarts: readonly number[],
  startToken: number,
  endToken: number,
): SpanRange {
  if (!(startToken >= 0 && startToken < endToken && endToken <= tokens.length)) {
    throw new RangeError(`Khoảng token không hợp lệ [${startToken}, ${endToken}) trên ${tokens.length} token`);
  }
  const startChar = tokens[startToken].start;
  const endChar = tokens[endToken - 1].end;
  return {
    startToken,
    endToken,
    startChar,
    endChar,
    lineStart: lineNumberAt(lineStarts, startChar),
    lineEnd: lineNumberAt(lineStarts, Math.max(startChar, endChar - 1)),
  };
}
