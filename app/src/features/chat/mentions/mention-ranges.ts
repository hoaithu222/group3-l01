import type { MentionRange, MentionRoleRef } from '../api/chat.types';

/**
 * Mô hình "text + ranges" (README p1-06 §10): ô nhập giữ CHỮ THƯỜNG (`@Minh`), các
 * cụm nhắc tên nằm ngoài dưới dạng `{ start, end }` và luôn thoả
 * `text.slice(start, end) === '@' + label`. `TextInput` của React Native không có
 * rich text nên không có "chip" thật — mọi thao tác dưới đây chỉ giữ cho các
 * range bám đúng chữ sau mỗi lần gõ.
 */

export interface RangesState {
  text: string;
  ranges: MentionRange[];
}

/** Bỏ range không còn khớp chữ (phòng mơ hồ của diff khi có ký tự lặp) hoặc chồng nhau; sắp theo vị trí. */
export function sanitizeRanges(text: string, ranges: MentionRange[]): MentionRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out: MentionRange[] = [];
  let lastEnd = -1;
  for (const range of sorted) {
    if (range.start < lastEnd) continue;
    if (text.slice(range.start, range.end) !== `@${range.label}`) continue;
    out.push(range);
    lastEnd = range.end;
  }
  return out;
}

/**
 * Cập nhật range sau `onChangeText(next)`. Diff bằng tiền tố/hậu tố chung dài nhất
 * (RN không báo vùng sửa) — tiền tố đi TRƯỚC nên khi ký tự lặp gây mơ hồ, thay đổi
 * được gán về phía SAU, tức là KHÔNG rơi vào chip đứng trước.
 *
 *  · Chèn/xoá nằm hẳn TRƯỚC range → dịch range; hẳn SAU (kể cả chạm mép) → giữ nguyên.
 *  · Backspace ngay sau chip (xoá thuần, kết thúc đúng cuối chip) → xoá CẢ chip
 *    (MSG-37 "xoá nguyên khối, không để lại marker hỏng") — đây là chỗ DUY NHẤT
 *    hàm trả `text` khác `next` (bỏ nốt phần đầu chip còn sót).
 *  · Sửa/chèn GIỮA chip (đổi chữ, chọn gợi ý của bàn phím) → chip thành chữ thường.
 *
 * ⚠️ IME: gõ dấu Telex/VNI diễn ra ở phần chữ THƯỜNG cạnh chip, nên hầu như không
 * bao giờ chạm nhánh xoá-cả-chip; nhánh đó chỉ chạy khi vùng xoá kết thúc ĐÚNG mép
 * cuối chip — thứ một phím Backspace ở ngay sau chip luôn tạo ra.
 */
export function applyTextChange(prev: string, next: string, ranges: MentionRange[]): RangesState {
  if (prev === next) return { text: next, ranges };
  const maxPrefix = Math.min(prev.length, next.length);
  let prefix = 0;
  while (prefix < maxPrefix && prev[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < maxPrefix - prefix &&
    prev[prev.length - 1 - suffix] === next[next.length - 1 - suffix]
  )
    suffix += 1;

  let from = prefix;
  const to = prev.length - suffix;
  const inserted = next.slice(prefix, next.length - suffix);
  let text = next;

  if (inserted === '') {
    const eaten = ranges.find((r) => r.end === to && r.start < from);
    if (eaten) {
      from = eaten.start;
      text = prev.slice(0, from) + prev.slice(to);
    }
  }
  const delta = inserted.length - (to - from);

  const kept: MentionRange[] = [];
  for (const range of ranges) {
    if (range.end <= from) kept.push(range);
    else if (range.start >= to)
      kept.push({ ...range, start: range.start + delta, end: range.end + delta });
    // còn lại: vùng sửa chạm vào ruột chip → bỏ range (chữ ở lại thành chữ thường).
  }
  return { text, ranges: sanitizeRanges(text, kept) };
}

export interface MentionPick {
  type: 'USER' | 'ALL' | 'ROLE';
  userId?: string;
  /** Chỉ `ROLE` (`@role`, p3-04) — đích là vai trò, không phải userId. */
  roleRef?: MentionRoleRef;
  /** Chỉ `ROLE` — số người sẽ nhận theo `mentionables` lúc chọn (composer nhắc "khoảng N người"). */
  recipientCount?: number;
  label: string;
}

/**
 * Thay đoạn `@từ-khoá` (`span`) bằng chip `@Tên` + MỘT dấu cách rồi trả vị trí con
 * trỏ ngay sau dấu cách đó. Dấu cách luôn có (kể cả khi đã có sẵn dấu cách phía
 * sau): chữ gõ tiếp không dính vào chip, và `findMentionTrigger` không mở lại
 * picker vì con trỏ đã ra khỏi range.
 */
export function insertMention(
  text: string,
  ranges: MentionRange[],
  span: { start: number; end: number },
  pick: MentionPick,
): RangesState & { cursor: number } {
  const token = `@${pick.label}`;
  const after = text.slice(span.end);
  const spaceExists = /^\s/.test(after);
  const insertion = spaceExists ? token : `${token} `;
  const nextText = text.slice(0, span.start) + insertion + after;
  const delta = insertion.length - (span.end - span.start);

  const kept = ranges
    .filter((r) => r.end <= span.start || r.start >= span.end)
    .map((r) => (r.start >= span.end ? { ...r, start: r.start + delta, end: r.end + delta } : r));
  kept.push({
    start: span.start,
    end: span.start + token.length,
    type: pick.type,
    label: pick.label,
    ...(pick.userId && { userId: pick.userId }),
    ...(pick.roleRef && { roleRef: pick.roleRef }),
    ...(pick.recipientCount !== undefined && { recipientCount: pick.recipientCount }),
  });
  return {
    text: nextText,
    ranges: sanitizeRanges(nextText, kept),
    cursor: span.start + token.length + 1,
  };
}
