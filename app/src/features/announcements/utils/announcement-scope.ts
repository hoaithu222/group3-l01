import type { MessageExtensionMessage, MessageExtensionScope } from '@/shared/message-extensions';

/**
 * Yêu cầu xác nhận chỉ tồn tại ở luồng CHÍNH của KÊNH (BE `ANN_001`: không phải kênh thông báo / không phải tin gốc):
 * hội thoại và màn luồng không có.
 */
export function isChannelRoot(scope: MessageExtensionScope): boolean {
  return scope.scopeType === 'CHANNEL' && scope.threadId === undefined;
}

/** Tin có thể mang yêu cầu: tin NGƯỜI DÙNG, gốc (không phải reply), chưa thu hồi. */
export function isAnnounceable(
  message: MessageExtensionMessage,
  scope: MessageExtensionScope,
): boolean {
  return (
    isChannelRoot(scope) && message.kind === 'USER' && message.threadId === null && !message.deleted
  );
}

/** Được tạo/huỷ yêu cầu: kênh thông báo (`ADMINS_ONLY`) + người xem quản lý được kênh — BE `channel.manage`. */
export function canManageAnnouncements(scope: MessageExtensionScope): boolean {
  return scope.postingPolicy === 'ADMINS_ONLY' && scope.canManage === true;
}
