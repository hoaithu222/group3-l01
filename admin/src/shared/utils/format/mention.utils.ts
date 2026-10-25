/**
 * @file mention.utils.ts
 * @description Phát hiện và chèn `@mention` trong ô nhập văn bản THUẦN.
 *
 * Hàm thuần, không biết gì về Matrix / phân hệ nào — nhờ vậy dùng được cho cả khung chat
 * (`meeting-chat`) lẫn widget kit2 (`pdf-annotator`). Trước đây nằm trong
 * `features/meeting-chat/utils/mention.utils.ts`; đã nâng lên đây khi widget đánh dấu PDF cần
 * dùng, vì `shared/ui` KHÔNG được phép import từ `features/*`.
 *
 * Phần dựng mxid / HTML pill của Matrix vẫn ở lại meeting-chat — đó là đặc thù giao thức,
 * không dùng chung.
 */

/** Trạng thái 1 @mention đang gõ dở trong ô nhập. */
export interface ActiveMention {
  /** Chuỗi sau dấu `@` tới vị trí con trỏ. */
  query: string;
  /** Vị trí dấu `@` trong text. */
  start: number;
}

/**
 * Phát hiện `@query` đang gõ tại vị trí con trỏ. `@` phải đứng đầu chuỗi hoặc
 * sau khoảng trắng; query không chứa khoảng trắng/`@`. Null nếu không có.
 */
export const getActiveMention = (text: string, caret: number): ActiveMention | null => {
  const before = text.slice(0, caret);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
  if (!match) return null;
  const query = match[1];
  return { query, start: caret - query.length - 1 };
};

/** Thay `@query` đang gõ bằng `@Name ` (kèm khoảng trắng), trả text + vị trí con trỏ mới. */
export const applyMention = (
  text: string,
  caret: number,
  mention: ActiveMention,
  name: string,
): { text: string; caret: number } => {
  const before = text.slice(0, mention.start);
  const after = text.slice(caret);
  const inserted = `${before}@${name} `;
  return { text: inserted + after, caret: inserted.length };
};
