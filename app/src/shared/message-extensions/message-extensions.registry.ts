import type {
  ChatRoomHostProps,
  ComposerAttachRowsProps,
  ComposerTopProps,
  MessageActionRowsProps,
  MessageBodyProps,
  MessageBubbleFooterProps,
  MessageExtensionRenderer,
} from './message-extensions.types';

/**
 * Ba registry của khe mở rộng tin nhắn. Cùng mẫu `registerSystemMessageRenderer` (`chat`) / `registerCallActionsRenderer`
 * (`@/shared/calls`): feature nguồn (vd `announcements`) đăng ký MỘT renderer ở NƠI LẮP RÁP, `chat` chỉ vẽ khe.
 *
 *  · `bubbleFooter` — hàng phụ dưới thân bong bóng của MỖI tin (huy hiệu "Cần xác nhận"…).
 *  · `actionRows`   — các dòng thêm vào tấm thao tác tin (nhấn giữ).
 *  · `roomHost`     — MỘT LẦN mỗi phòng chat: đồng bộ realtime + các tấm/hộp thoại mà dòng thao tác "yêu cầu" mở.
 *  · `messageBody`  — (p7-04) vẽ THAY thân bong bóng cho loại tin riêng (khảo sát `kind = 'POLL'`); trả `null` = không phải của tôi.
 *  · `attachRows`   — (p7-04) dòng thêm vào menu "+" của ô soạn tin (Khảo sát, Hẹn giờ gửi).
 *  · `composerTop`  — (p7-04) dải nằm ngay TRÊN ô soạn tin (banner "N tin đã hẹn").
 *
 * Đăng ký lặp cùng `id` là GHI ĐÈ (idempotent, an toàn với Fast Refresh); `null` gỡ đăng ký (test).
 * ⚠️ Đăng ký TRƯỚC khi danh sách tin vẽ lần đầu — đăng ký trong effect của màn thì tin đầu tiên vẫn chưa có khe.
 */
const bubbleFooters = new Map<string, MessageExtensionRenderer<MessageBubbleFooterProps>>();
const actionRows = new Map<string, MessageExtensionRenderer<MessageActionRowsProps>>();
const roomHosts = new Map<string, MessageExtensionRenderer<ChatRoomHostProps>>();
const messageBodies = new Map<string, MessageExtensionRenderer<MessageBodyProps>>();
const attachRows = new Map<string, MessageExtensionRenderer<ComposerAttachRowsProps>>();
const composerTops = new Map<string, MessageExtensionRenderer<ComposerTopProps>>();

function put<T>(registry: Map<string, T>, id: string, renderer: T | null): void {
  if (renderer === null) registry.delete(id);
  else registry.set(id, renderer);
}

export function registerMessageBubbleFooter(
  id: string,
  renderer: MessageExtensionRenderer<MessageBubbleFooterProps> | null,
): void {
  put(bubbleFooters, id, renderer);
}

export function registerMessageActionRows(
  id: string,
  renderer: MessageExtensionRenderer<MessageActionRowsProps> | null,
): void {
  put(actionRows, id, renderer);
}

export function registerChatRoomHost(
  id: string,
  renderer: MessageExtensionRenderer<ChatRoomHostProps> | null,
): void {
  put(roomHosts, id, renderer);
}

export function registerMessageBody(
  id: string,
  renderer: MessageExtensionRenderer<MessageBodyProps> | null,
): void {
  put(messageBodies, id, renderer);
}

export function registerComposerAttachRows(
  id: string,
  renderer: MessageExtensionRenderer<ComposerAttachRowsProps> | null,
): void {
  put(attachRows, id, renderer);
}

export function registerComposerTop(
  id: string,
  renderer: MessageExtensionRenderer<ComposerTopProps> | null,
): void {
  put(composerTops, id, renderer);
}

export const getMessageBubbleFooters = () => Array.from(bubbleFooters);
export const getMessageActionRows = () => Array.from(actionRows);
export const getChatRoomHosts = () => Array.from(roomHosts);
export const getMessageBodies = () => Array.from(messageBodies);
export const getComposerAttachRows = () => Array.from(attachRows);
export const getComposerTops = () => Array.from(composerTops);
