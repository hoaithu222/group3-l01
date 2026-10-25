import type { Href } from 'expo-router';

import type { DeepLinkIntent, DeepLinkIntentType, IntentOf } from './deep-link.types';
import { parseDeepLink, type ParseDeepLinkOptions } from './deep-link-parser';

/**
 * Ý định → `Href` của route ĐÃ CÓ (p0-12 app.md §2 `intent-handlers`). Hàm thuần, không điều hướng, không gọi API:
 * quyền/tồn tại do MÀN ĐÍCH kiểm bằng API (404 ⇒ màn trung tính "không còn khả dụng" — README §3), nên ở đây không có gì để
 * lộ (không đọc tên kênh, số thành viên…).
 *
 * Mỗi loại có MỘT bộ xử lý mặc định trỏ vào route hiện có. Feature muốn đổi đích (vd meeting p2-04 mở thẳng
 * `/meetings/[id]` thay vì qua `m/[id]`) gọi `registerIntentHandler(type, resolver)` — ghi đè, không phải sửa file này.
 * Trả `null` = "không mở được" ⇒ `DeepLinkRedirect` đưa về Trang chủ kèm thông báo trung tính.
 */

type Resolver<T extends DeepLinkIntentType> = (intent: IntentOf<T>) => Href | null;
type Resolvers = { [T in DeepLinkIntentType]: Resolver<T> };

const withMessage = (messageId: string | undefined): { m?: string } =>
  messageId ? { m: messageId } : {};

const DEFAULT_RESOLVERS: Resolvers = {
  INVITE: ({ code, kind }) =>
    kind === 'EMAIL'
      ? { params: { token: code }, pathname: '/invite/e/[token]' }
      : { params: { code }, pathname: '/invite/[code]' },
  // `/m/[id]` phân loại theo HÌNH DẠNG mã (D-29) và tự giải mã họp bằng API — không cần biết `meetingId` ở đây.
  MEETING_CODE: ({ code }) => ({ params: { id: code }, pathname: '/m/[id]' }),
  CONVERSATION: ({ conversationId, messageId }) => ({
    params: { conversationId, ...withMessage(messageId) },
    pathname: '/messages/[conversationId]',
  }),
  MESSAGE_LINK: ({ chId, messageId, wsId }) => ({
    params: { chId, wsId, ...withMessage(messageId) },
    pathname: '/workspaces/[wsId]/channels/[chId]',
  }),
  CALL: ({ callId }) => ({ params: { callId }, pathname: '/call/[callId]' }),
};

const resolvers: Resolvers = { ...DEFAULT_RESOLVERS };

/** Ghi đè bộ xử lý của MỘT loại ý định (feature nắm đích thật đăng ký lúc nạp module). */
export function registerIntentHandler<T extends DeepLinkIntentType>(
  type: T,
  resolver: Resolver<T>,
): void {
  (resolvers as Record<DeepLinkIntentType, unknown>)[type] = resolver;
}

/** CHỈ dùng trong test: trả các bộ xử lý về mặc định. */
export function __resetIntentHandlersForTests(): void {
  Object.assign(resolvers, DEFAULT_RESOLVERS);
}

export function resolveIntentHref(intent: DeepLinkIntent): Href | null {
  switch (intent.type) {
    case 'INVITE':
      return resolvers.INVITE(intent);
    case 'MEETING_CODE':
      return resolvers.MEETING_CODE(intent);
    case 'CONVERSATION':
      return resolvers.CONVERSATION(intent);
    case 'MESSAGE_LINK':
      return resolvers.MESSAGE_LINK(intent);
    case 'CALL':
      return resolvers.CALL(intent);
  }
}

/** Liên kết → `Href` trong một bước (`null` khi link lạ hoặc không có bộ xử lý mở được). */
export function resolveDeepLink(url: string, options?: ParseDeepLinkOptions): Href | null {
  const intent = parseDeepLink(url, options);
  // if/else thay cho `intent ? resolveIntentHref(intent) : null` — cùng lý do TS2590 với `DeepLinkRedirect`.
  if (!intent) return null;
  return resolveIntentHref(intent);
}
