import type { ReactNode } from 'react';

/**
 * Kiểu của các KHE MỞ RỘNG tin nhắn (`chat` → feature khác) — p5-04 xác nhận đã đọc là consumer đầu tiên.
 *
 * ⚠️ Cố ý KHÔNG import `MessageView` của `chat`: `shared/` không được phụ thuộc `features/`. `MessageExtensionMessage`
 * chỉ khai phần tối thiểu mà khe cần; `MessageView` của `chat` thoả kiểu này theo cấu trúc nên `chat` truyền thẳng vào.
 */

export type MessageExtensionScopeType = 'CHANNEL' | 'CONVERSATION';

/**
 * Bối cảnh phạm vi mà `chat` đưa cho khe. `postingPolicy`/`canManage` là dữ kiện ĐẶC THÙ KÊNH do MÀN CHA nạp qua prop
 * (`ChatRoom.extension`) — `chat` không tự suy (`feature-structure.md`: chat nhận mọi thứ đặc thù scope qua PROPS).
 * Vắng mặt = màn cha không biết/không phải kênh ⇒ khe coi như KHÔNG áp dụng (an toàn hơn hiện nhầm nút).
 */
export interface MessageExtensionScope {
  scopeType: MessageExtensionScopeType;
  scopeId: string;
  /** Có ⇒ đang ở màn LUỒNG của một tin gốc — khe theo tin gốc của luồng chính bỏ qua. */
  threadId?: string;
  /** Chỉ kênh: chính sách đăng bài (`ADMINS_ONLY` = kênh thông báo). */
  postingPolicy?: 'MEMBERS' | 'ADMINS_ONLY';
  /** Chỉ kênh: người xem quản lý được kênh (`channel.myPermissions.canManage`). */
  canManage?: boolean;
  /** Chỉ kênh: nhóm chứa kênh — route của khe (vd danh sách xác nhận) cần `wsId` mà `scope` không có. */
  workspaceId?: string;
}

/** Phần dữ kiện màn cha truyền qua `ChatRoom.extension` (phần còn lại của `MessageExtensionScope` do `chat` tự có). */
export type MessageExtensionFacts = Pick<
  MessageExtensionScope,
  'canManage' | 'postingPolicy' | 'workspaceId'
>;

/**
 * Lựa chọn của khảo sát (p7-04) — hình dạng THẬT của `MessagePollView` phía BE (`be/src/shared/ports/message-poll-reader.port.ts`); ngày giờ là chuỗi ISO qua JSON.
 * Đặt ở `shared/` (không ở feature `chat-extensions`) vì `MessageView` của `chat` PHẢI mang `poll` mà `chat` không được import feature khác.
 */
export interface MessagePollOptionView {
  id: string;
  text: string;
  voteCount: number;
  /** 0–100, làm tròn 1 chữ số, tính trên `voterCount` (chọn nhiều đáp án: tổng có thể > 100). */
  percent: number;
}

export interface MessagePollView {
  id: string;
  messageId: string;
  scopeType: MessageExtensionScopeType;
  scopeId: string;
  question: string;
  multi: boolean;
  anonymous: boolean;
  closesAt: string | null;
  status: 'OPEN' | 'CLOSED';
  closeReason: 'EXPIRED' | 'BY_CREATOR' | 'BY_MODERATOR' | 'MESSAGE_RECALLED' | null;
  options: MessagePollOptionView[];
  voterCount: number;
  /** CHỈ của người xem. Tin đến qua socket (`message:created`) là bản dùng chung nên luôn rỗng. */
  myOptionIds: string[];
  /** ⚠️ Bản dùng chung (socket) luôn `false` — nơi dùng phải tự suy thêm từ "là người tạo / là moderator". */
  canClose: boolean;
  /** ⚠️ Cùng lưu ý với `canClose`. */
  canViewVoters: boolean;
  version: number;
  /** Chỉ có ở response trực tiếp của endpoint khảo sát. */
  serverNow?: string;
}

/** Tin đã được chuyển thành thẻ công việc / tài liệu (`MessageView.sourceRefs`, p7-04). */
export interface MessageSourceRefView {
  kind: 'TASK' | 'RESOURCE';
  refId: string;
  createdAt: string;
}

export interface MessageExtensionMention {
  type: 'USER' | 'ROLE' | 'ALL';
  targetId?: string | null;
}

export interface MessageExtensionMessage {
  id: string;
  kind: 'USER' | 'SYSTEM' | 'POLL';
  /** id TIN GỐC của luồng nếu đây là reply; `null` với tin gốc/ngoài luồng. */
  threadId: string | null;
  deleted: boolean;
  authorId: string | null;
  /** p7-04: nội dung thô (còn marker nhắc tên) — khe "Tạo task" lấy tiêu đề mặc định. Vắng mặt ở nơi dựng tin tối giản. */
  content?: string | null;
  mentions?: MessageExtensionMention[];
  /** p7-04: tệp đính kèm (chỉ phần khe cần) — khe "Lưu vào tài liệu" liệt kê tệp của tin. `MessageView.attachments` thoả kiểu này theo cấu trúc. */
  attachments?: { assetId: string; name: string }[];
  /** p7-04: khảo sát của tin `kind = 'POLL'`. */
  poll?: MessagePollView;
  sourceRefs?: MessageSourceRefView[];
  /** p7-04: quyền của người xem trên tin (`MessageView.myPermissions`) — khảo sát cần `canModerate` để hiện "Kết thúc khảo sát". */
  myPermissions?: { canModerate: boolean };
}

export interface MessageBubbleFooterProps {
  isOwn: boolean;
  message: MessageExtensionMessage;
  scope: MessageExtensionScope;
}

export interface MessageActionRowsProps {
  message: MessageExtensionMessage;
  /** Đóng tấm thao tác TRƯỚC khi mở tấm/hộp khác (cùng nhịp `act()` của `MessageActionSheet`). */
  onDone: () => void;
  scope: MessageExtensionScope;
}

export interface ChatRoomHostProps {
  scope: MessageExtensionScope;
}

/** Thân bong bóng do feature khác vẽ THAY nội dung chữ (khảo sát p7-04). Trả `null` = "không phải loại tin của tôi", `chat` vẽ thân mặc định. */
export interface MessageBodyProps {
  isOwn: boolean;
  message: MessageExtensionMessage;
  scope: MessageExtensionScope;
}

/** Cụm khe phía trên ô soạn tin (banner "N tin đã hẹn"…). */
export interface ComposerTopProps {
  scope: MessageExtensionScope;
}

/**
 * Bản chụp ô soạn tin lúc mở menu "+" — để một tiện ích (hẹn giờ gửi) dùng ĐÚNG nội dung đang soạn mà không phải chạm vào state của composer.
 * `content` đã tuần tự hoá (marker nhắc tên) và đã cắt khoảng trắng; `canSubmit` = gửi được ngay lúc này (có nội dung/tệp sẵn sàng, không quá dài, không đang sửa tin).
 */
export interface ComposerDraftSnapshot {
  content: string;
  mentions: { type: 'USER' | 'ROLE' | 'ALL'; targetId?: string }[];
  attachmentAssetIds: string[];
  replyToId?: string;
  canSubmit: boolean;
  /** Xoá chữ/tệp/nháp như sau khi gửi — tiện ích gọi sau khi đã nhận nội dung đi (vd hẹn giờ thành công). */
  consume: () => void;
}

export interface ComposerAttachRowsProps {
  scope: MessageExtensionScope;
  draft: ComposerDraftSnapshot;
  /** Đóng menu "+" TRƯỚC khi mở tấm khác. */
  onDone: () => void;
}

/**
 * Renderer là HÀM trả `ReactNode` chứ không phải component: tra một component từ registry ngay lúc render bị
 * `react-hooks/static-components` chặn (mỗi lần vẽ là một kiểu component mới, state con bị reset).
 */
export type MessageExtensionRenderer<TProps> = (props: TProps) => ReactNode;
