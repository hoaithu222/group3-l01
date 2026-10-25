import type { ConversationDetail, ConversationListItem } from '../api/conversations.types';
import { patchConversation, type ConversationListData } from './conversation-list-pages';
import type { ConversationUpdatedEvent } from './conversation-socket-events.types';

/** `conversation:updated` áp cho HÀNG danh sách — không có `version` ở `ConversationListItem` nên vá thẳng (last-write-wins), khác detail bên dưới. */
export function applyConversationUpdatedInList(
  data: ConversationListData | undefined,
  payload: ConversationUpdatedEvent,
): ConversationListData | undefined {
  if (!data) return data;
  return patchConversation(data, payload.id, (item) => patchByUpdate(item, payload));
}

/** Vá MỘT hàng theo `conversation:updated` — dùng chung cho danh sách và mục "Đã ghim" (mảng thường). */
export function patchByUpdate(item: ConversationListItem, payload: ConversationUpdatedEvent): ConversationListItem {
  return {
    ...item,
    ...(payload.title !== undefined && { title: payload.title }),
    ...(payload.avatarUrl !== undefined && { avatarUrl: payload.avatarUrl }),
    ...(payload.status !== undefined && { status: payload.status }),
    ...(payload.memberCount !== undefined && { memberCount: payload.memberCount }),
    ...(payload.readOnly !== undefined && { readOnly: payload.readOnly }),
    ...(payload.readOnlyReason !== undefined && { readOnlyReason: payload.readOnlyReason ?? null }),
  };
}

/** `conversation:updated` áp cho `ConversationDetail` — bỏ qua bản CŨ hơn version đang cache (cùng luật `applyMessageUpdated`). */
export function applyConversationUpdatedInDetail(
  detail: ConversationDetail | undefined,
  payload: ConversationUpdatedEvent,
): ConversationDetail | undefined {
  if (!detail || payload.id !== detail.id) return detail;
  // Bản riêng của chặn/bỏ chặn không có `version` — không có gì để so, áp dụng thẳng (chỉ vá `readOnly`).
  if (payload.version !== undefined && payload.version <= detail.version) return detail;
  // BE (`computeMyPermissions`): `canSend`/`canCall` = hội thoại ACTIVE && (nhóm || đủ điều kiện nhắn) = `!readOnly`.
  // `ChatRoom` khoá ô nhập theo `myPermissions.canSend` — không vá thì chặn/bỏ chặn xong ô nhập vẫn như cũ tới lần tải lại.
  const myPermissions =
    payload.readOnly === undefined
      ? detail.myPermissions
      : { ...detail.myPermissions, canSend: !payload.readOnly, canCall: !payload.readOnly };
  return {
    ...detail,
    myPermissions,
    ...(payload.title !== undefined && { title: payload.title }),
    ...(payload.avatarUrl !== undefined && { avatarUrl: payload.avatarUrl }),
    ...(payload.status !== undefined && { status: payload.status }),
    ...(payload.memberCount !== undefined && { memberCount: payload.memberCount }),
    ...(payload.readOnly !== undefined && { readOnly: payload.readOnly }),
    ...(payload.readOnlyReason !== undefined && { readOnlyReason: payload.readOnlyReason ?? null }),
    ...(payload.version !== undefined && { version: payload.version }),
  };
}
