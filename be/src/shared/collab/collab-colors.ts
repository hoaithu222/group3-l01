/**
 * Bảng 8 màu con trỏ/hiện diện cho cộng tác (p6-01 app.md §7 "bảng 8 màu token") — tất cả đủ tương phản (≥ 4.5:1) với chữ trắng để nhãn tên
 * hiển thị trên con trỏ đọc được (kiểm bằng test `collab-colors.test.ts`). Màu chọn TẤT ĐỊNH theo `userId` nên mọi thiết bị thấy cùng một màu cho cùng một người.
 */
export const COLLAB_COLORS = ["#B42318", "#B54708", "#3B7A0A", "#027A48", "#0E7090", "#175CD3", "#5925DC", "#C11574"] as const;

export function collabColorFor(userId: string): string {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLLAB_COLORS[hash % COLLAB_COLORS.length] as string;
}
