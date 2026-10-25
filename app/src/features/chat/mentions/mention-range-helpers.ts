import type { MentionRange } from '../api/chat.types';
import { mentionTargetKey } from './mention-role';
import { sanitizeRanges } from './mention-ranges';

/**
 * Hàm ĐỌC/gắn cờ trên danh sách range — tách khỏi `mention-ranges.ts` (chỉnh sửa range khi gõ) để mỗi file
 * giữ dưới trần dòng và mỗi file chỉ có MỘT việc.
 */

/** Số đích DISTINCT — BE giới hạn `mentionsMax` (20) theo đích khác nhau, không theo số chip. */
export function countDistinctMentions(ranges: MentionRange[]): number {
  return new Set(ranges.map(mentionTargetKey)).size;
}

/** Tô đỏ các chip server từ chối (`MSG_008 details.invalidMentions[].targetId`) — bỏ tô nếu chip đó không thuộc danh sách. */
export function markInvalidRanges(
  ranges: MentionRange[],
  invalidUserIds: string[],
): MentionRange[] {
  const invalid = new Set(invalidUserIds);
  return ranges.map((r) => ({
    ...r,
    invalid: r.type === 'USER' && r.userId !== undefined && invalid.has(r.userId),
  }));
}

/** Chia `text` theo range thành các đoạn để dựng lớp tô nền phía sau ô nhập. */
export function segmentByRanges(
  text: string,
  ranges: MentionRange[],
): { text: string; range?: MentionRange }[] {
  const out: { text: string; range?: MentionRange }[] = [];
  let cursor = 0;
  for (const range of sanitizeRanges(text, ranges)) {
    if (range.start > cursor) out.push({ text: text.slice(cursor, range.start) });
    out.push({ text: text.slice(range.start, range.end), range });
    cursor = range.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}
