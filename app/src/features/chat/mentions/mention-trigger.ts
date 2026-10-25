import type { MentionRange } from '../api/chat.types';

export interface MentionTrigger {
  /** Vị trí ký tự `@` trong text — điểm bắt đầu đoạn sẽ bị chip thay thế. */
  start: number;
  /** Chữ đã gõ SAU `@` tới con trỏ (chưa trim). */
  query: string;
}

/** Tên dài hơn mức này hầu như chắc là câu chứ không phải từ khoá tìm người. */
const MAX_QUERY_LENGTH = 30;

/**
 * Con trỏ đang nằm trong một cụm `@từ-khoá` dở dang không? (app.md p1-06 §3 "Mở khi
 * gõ `@` sau khoảng trắng/đầu dòng … đóng khi gõ khoảng trắng hai lần hoặc xoá `@`").
 *
 * Hàm THUẦN suy ra từ `(text, con trỏ)` — không có state "picker đang mở": xoá `@`
 * hay dời con trỏ ra ngoài là tự đóng, và không có gì ghi ngược vào ô nhập trong
 * lúc bộ gõ tiếng Việt còn đang ghép dấu (chỉ ĐỌC text, không bao giờ sửa nó).
 *
 *  · `a@b.com` không mở (trước `@` phải là đầu chuỗi hoặc khoảng trắng).
 *  · `@ ` (khoảng trắng ngay sau `@`) đóng; tên có dấu cách giữa (`@Nguyễn Văn`) vẫn mở
 *    — hai dấu cách liền nhau thì đóng.
 *  · `@` nằm TRONG một chip đã có không mở lại (con trỏ vừa dừng cuối chip).
 */
export function findMentionTrigger(
  text: string,
  cursor: number,
  ranges: MentionRange[],
): MentionTrigger | null {
  for (let i = cursor - 1; i >= 0 && cursor - i - 1 <= MAX_QUERY_LENGTH; i -= 1) {
    const ch = text[i];
    if (ch === '\n') return null;
    if (ch !== '@') continue;

    const before = i === 0 ? undefined : text[i - 1];
    if (before !== undefined && !/\s/.test(before)) return null;
    if (ranges.some((r) => i >= r.start && i < r.end)) return null;

    const query = text.slice(i + 1, cursor);
    if (/^\s/.test(query) || /\s\s/.test(query)) return null;
    return { start: i, query };
  }
  return null;
}
