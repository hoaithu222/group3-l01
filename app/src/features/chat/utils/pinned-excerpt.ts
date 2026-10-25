import type { MessageView } from '../api/chat.types';
import { mentionsToPlainText } from '../mentions/mention-markup';
import { previewText } from './preview-text';

/**
 * Nội dung một dòng tin ghim (thanh ghim ở đầu phòng chat + danh sách "Tin đã ghim" của `discovery`). Ưu tiên CHỮ (marker
 * `@{u:<id>}` → `@Tên` — tuyệt đối không in id thô), chỉ khi tin không có chữ mới rơi về nhãn tệp (`[Ảnh]`, `[Tệp] tên`…) của
 * `previewText`: tin ảnh kèm chú thích thì người đọc cần chú thích, không phải chữ "[Ảnh]". `previewText` cũng lo ca tin đã
 * thu hồi/tin hệ thống.
 */
export function pinnedExcerpt(item: MessageView): string {
  if (!item.deleted && item.content) {
    const text = mentionsToPlainText(item.content, item.mentions).trim();
    if (text) return text;
  }
  return previewText(item, 160) || 'Tin nhắn';
}
