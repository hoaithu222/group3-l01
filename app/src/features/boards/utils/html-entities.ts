import type { TaskCommentDto, TaskDetailDto } from '../api/task-detail.types';

/**
 * BE `sanitizeInput` lưu `<`, `>`, `&` trong CHỮ THƯỜNG/code của mô tả thẻ và bình luận dưới dạng thực thể HTML
 * (`a &lt; b &amp;&amp; c`; kể cả `>` đầu dòng của trích dẫn thành `&gt;`) — be.md p3-03 §14 mục 14, có test khoá
 * hành vi ở `sanitize-markdown.test.ts`. App hiển thị bằng `<Text>` (không phải HTML) nên KHÔNG tự giải mã sẽ thấy
 * `&lt;` nguyên văn — và sửa rồi lưu thì `&` bị escape LẦN NỮA (`&amp;lt;`) làm hỏng nội dung qua mỗi lượt sửa.
 *
 * ⚠️ Giải mã MỘT LẦN, ở biên nhận dữ liệu (service + socket) — KHÔNG ở lúc vẽ: cache đã giải mã rồi mà vẽ giải mã
 * thêm lần nữa thì `&amp;lt;` (người dùng thật sự gõ chữ `&lt;`) thành `<`. Một lượt `replace` duy nhất nên
 * `&amp;lt;` → `&lt;` chứ không phải `<`.
 */
const ENTITIES: Record<string, string> = {
  '&#39;': "'",
  '&#x27;': "'",
  '&amp;': '&',
  '&gt;': '>',
  '&lt;': '<',
  '&quot;': '"',
};

const ENTITY_RE = /&(?:amp|lt|gt|quot|#39|#x27);/gi;

export function decodeHtmlEntities(text: string): string {
  return text.replace(ENTITY_RE, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
}

/** Bản chi tiết thẻ với `description` đã giải mã (`null` giữ nguyên). */
export function decodeTaskDetail(detail: TaskDetailDto): TaskDetailDto {
  return detail.description
    ? { ...detail, description: decodeHtmlEntities(detail.description) }
    : detail;
}

/** Bình luận với `content` đã giải mã (tombstone `content: ""` giữ nguyên). */
export function decodeComment<T extends Pick<TaskCommentDto, 'content'>>(comment: T): T {
  return comment.content ? { ...comment, content: decodeHtmlEntities(comment.content) } : comment;
}
