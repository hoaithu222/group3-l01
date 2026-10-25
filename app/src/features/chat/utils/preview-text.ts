import type { AttachmentKind, MessageView } from '../api/chat.types';
import { mentionsToPlainText } from '../mentions/mention-markup';
import { truncateGraphemes } from './grapheme';

/** Khớp `preview` do adapter BE tạo (be.md §6). */
const ATTACHMENT_LABEL: Record<AttachmentKind, string> = {
  IMAGE: '[Ảnh]',
  VIDEO: '[Video]',
  VOICE: '[Tin nhắn thoại]',
  AUDIO: '[Tệp âm thanh]',
  FILE: '[Tệp]',
};

export type PreviewableMessage = Pick<MessageView, 'deleted' | 'kind' | 'content' | 'attachments' | 'systemType'> &
  Partial<Pick<MessageView, 'mentions'>>;

/**
 * Tóm tắt một tin cho `ReplyStrip` (đang soạn — chưa có `replyPreview` server
 * sinh), `ForwardSheet` (xem trước tin sắp chuyển tiếp), `EditStrip`. Tin ĐÃ
 * GỬI có `replyPreview` riêng từ server (be.md §5.1) — `ReplyQuote` đọc thẳng
 * `replyPreview.excerpt`/`.deleted`, KHÔNG gọi hàm này (tránh tính lại sai khác
 * với server khi nội dung đã bị sửa/xoá sau khi trả lời).
 */
export function previewText(message: PreviewableMessage, maxGraphemes = 80): string {
  if (message.deleted) return 'Tin nhắn đã bị thu hồi';
  if (message.kind === 'SYSTEM') return 'Tin nhắn hệ thống';
  // p7-04: `content` của tin khảo sát là CÂU HỎI — khớp tiền tố "[Khảo sát]" mà BE gắn vào `preview`/`excerpt` (`message-projection.ts`).
  if (message.kind === 'POLL') return `[Khảo sát] ${truncateGraphemes((message.content ?? '').trim(), maxGraphemes)}`.trim();

  const first = message.attachments[0];
  if (first) {
    const label = ATTACHMENT_LABEL[first.kind];
    return first.kind === 'FILE' ? `${label} ${first.name}` : label;
  }

  // Marker `@{u:…}` → `@Tên`: xem trước/nhãn trợ năng tuyệt đối không được in id thô.
  const text = mentionsToPlainText(message.content ?? '', message.mentions).trim();
  return text ? truncateGraphemes(text, maxGraphemes) : '';
}
