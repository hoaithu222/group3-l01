import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

/**
 * Biểu tượng thay cho ảnh đại diện khi mục KHÔNG có người thực hiện. BE chỉ điền `actor` cho mục thuộc tin nhắn; thẻ/nhóm/họp/ví/… luôn
 * không có, nên trước đây `Avatar` rơi về chữ "?" — trông như lỗi. Biểu tượng nói LOẠI thông báo (nhóm, quyền, họp…) thay vì một người.
 *
 * Tra theo tiền tố của `type` (chuỗi BE phát, `registerNotificationType`). Loại chưa có tiền tố ở đây rơi về chuông — ⚠️ thêm loại mới ở
 * BE thì thêm tiền tố tương ứng, cùng chỗ với `describe-*.ts`.
 */
const BY_PREFIX: [prefix: string, icon: IconName][] = [
  ['message.reminder', 'noti'], // p7-04 — TRƯỚC `message.` (khớp tiền tố đầu tiên)
  ['scheduled-message.', 'timer'],
  ['workspace.admin-change', 'shield-user'],
  ['workspace.', 'add-team'],
  ['guest.', 'add-team'],
  ['conversation.', 'chat-bubble'],
  ['channel.', 'chat-bubble'],
  ['mention', 'chat-bubble'],
  ['message.', 'chat-bubble'],
  ['thread.', 'chat-bubble'],
  ['announcement.', 'noti-new'],
  ['task.', 'checkmark-square'],
  ['review.', 'checkmark-square'],
  ['meeting.', 'calendar'],
  ['call.', 'phone'],
  ['gamification.', 'star'],
  ['career.', 'star'],
  ['study.', 'book'],
  ['wallet.', 'wallet-add'],
  ['print-order.', 'document'],
  ['mentor.', 'support'],
  ['job-offer.', 'email'],
  ['company.', 'store'],
  ['integration.', 'link'],
  ['moderation.', 'shield-user'],
  ['contribution.', 'chart-1'],
  ['portfolio.', 'link'],
];

export function activityIconFor(type: string): IconName {
  return BY_PREFIX.find(([prefix]) => type.startsWith(prefix))?.[1] ?? 'notification';
}

/**
 * Tông màu của ô icon theo HỌ sự kiện — để lướt danh sách là phân biệt được "chat / việc / họp / ví / quản trị" bằng màu
 * trước khi đọc chữ. Cùng bảng tiền tố với `BY_PREFIX` (thêm loại mới ở BE thì thêm CẢ HAI chỗ). ⚠️ Màu chỉ để quét nhanh,
 * không mang nghĩa trạng thái: nghĩa nằm ở câu mô tả; `danger` chỉ dành cho kiểm duyệt (việc cần xử lý), không dùng cho "có lỗi".
 */
const TONE_BY_PREFIX: [prefix: string, tone: IconTileTone][] = [
  ['message.reminder', 'warning'], // p7-04 — TRƯỚC `message.`
  ['scheduled-message.', 'accent'],
  ['workspace.admin-change', 'brand'],
  ['workspace.', 'brand'],
  ['guest.', 'brand'],
  ['conversation.', 'info'],
  ['channel.', 'info'],
  ['mention', 'info'],
  ['message.', 'info'],
  ['thread.', 'info'],
  ['announcement.', 'accent'],
  ['task.', 'success'],
  ['review.', 'success'],
  ['meeting.', 'info'],
  ['call.', 'success'],
  ['gamification.', 'accent'],
  ['career.', 'accent'],
  ['study.', 'brand'],
  ['wallet.', 'success'],
  ['print-order.', 'neutral'],
  ['mentor.', 'accent'],
  ['job-offer.', 'accent'],
  ['company.', 'neutral'],
  ['integration.', 'neutral'],
  ['moderation.', 'danger'],
  ['contribution.', 'warning'],
  ['portfolio.', 'accent'],
];

export function activityToneFor(type: string): IconTileTone {
  return TONE_BY_PREFIX.find(([prefix]) => type.startsWith(prefix))?.[1] ?? 'brand';
}
