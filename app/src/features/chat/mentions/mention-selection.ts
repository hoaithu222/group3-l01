import type { MentionRange } from '../api/chat.types';
import { sanitizeRanges, type RangesState } from './mention-ranges';

/**
 * Chèn `insertion` vào đúng vùng `span` (con trỏ: `start === end`; đang bôi đen: thay cả vùng) và trả vị trí con trỏ
 * ngay sau đoạn vừa chèn — cho bảng emoji (chạm là chèn tại con trỏ).
 *
 * ⚠️ KHÔNG dùng `applyTextChange` (diff tiền tố/hậu tố) cho việc này: ta ĐÃ BIẾT chính xác vùng sửa nên không cần đoán lại
 * từ hai chuỗi — diff mơ hồ khi đoạn chèn trùng ký tự lân cận (chèn `😀` cạnh `😀` có sẵn). Ở đây chip nằm hẳn TRƯỚC vùng
 * sửa → giữ, hẳn SAU → dịch, chạm vào ruột chip → bỏ chip (chữ ở lại thành chữ thường, y như gõ chữ vào giữa chip).
 * Chèn ĐÚNG mép cuối chip vẫn giữ chip (chữ mới nằm ngoài `@Tên`); ĐÚNG mép đầu thì chip dịch sang phải.
 */
export function replaceSelection(
  text: string,
  ranges: MentionRange[],
  span: { start: number; end: number },
  insertion: string,
): RangesState & { cursor: number } {
  const start = Math.max(0, Math.min(span.start, span.end, text.length));
  const end = Math.min(text.length, Math.max(span.start, span.end));
  const nextText = text.slice(0, start) + insertion + text.slice(end);
  const delta = insertion.length - (end - start);

  const kept: MentionRange[] = [];
  for (const range of ranges) {
    if (range.end <= start) kept.push(range);
    else if (range.start >= end)
      kept.push({ ...range, start: range.start + delta, end: range.end + delta });
    // còn lại: vùng sửa chạm vào ruột chip → bỏ range.
  }
  return { text: nextText, ranges: sanitizeRanges(nextText, kept), cursor: start + insertion.length };
}

/** Độ dài phần đầu CHUNG của hai chuỗi — vị trí chip vừa biến mất khi Backspace xoá nguyên chip (xem `useComposerText.changeText`). */
export function commonPrefixLength(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
  return length;
}
