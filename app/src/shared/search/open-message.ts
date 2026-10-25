import { router, type Href } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

export type OpenMessageScopeType = 'CHANNEL' | 'CONVERSATION';

/** Đủ thông tin để mở đúng một tin — từ kết quả tìm, mục "Đã lưu", dòng tin ghim, hay tệp đính kèm của một tin. */
export interface OpenMessageTarget {
  scopeType: OpenMessageScopeType;
  scopeId: string;
  /** Bắt buộc với KÊNH (route kênh nằm dưới `/workspaces/[wsId]/…`); hội thoại không cần. */
  workspaceId: string | null | undefined;
  messageId: string;
  /**
   * id TIN GỐC của luồng (= `parentMessageId`/`threadId` của BE — KHÔNG phải `Thread.id`); có giá trị ⇒ tin là reply
   * trong luồng và phải mở bằng màn luồng. Hội thoại không có luồng nên bỏ qua.
   */
  threadRootId?: string | null;
}

/**
 * Href tới tin, hoặc `null` khi thiếu `workspaceId` của kênh (không dựng nổi route — nơi gọi hiện thông báo thay vì
 * điều hướng tới đường dẫn hỏng).
 *
 * Tham số `m` là cơ chế MỞ-QUANH có sẵn của p1-03/p1-04/p1-06: màn chat gọi `GET …/messages?around=<m>` rồi cuộn + tô nổi
 * tin (`useOpenAtMessage`). Ở màn luồng `m` là reply cần mở, gốc luồng nằm ở tham số đường dẫn `messageId`.
 */
export function buildMessageHref(target: OpenMessageTarget): Href | null {
  const { messageId, scopeId, scopeType, threadRootId, workspaceId } = target;

  if (scopeType === 'CONVERSATION') {
    return {
      pathname: '/messages/[conversationId]',
      params: { conversationId: scopeId, m: messageId },
    };
  }
  if (!workspaceId) return null;
  if (threadRootId) {
    return {
      pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
      params: { wsId: workspaceId, chId: scopeId, messageId: threadRootId, m: messageId },
    };
  }
  return {
    pathname: '/workspaces/[wsId]/channels/[chId]',
    params: { wsId: workspaceId, chId: scopeId, m: messageId },
  };
}

/**
 * Điều hướng tới tin bằng `router.push` — màn gọi (tìm/đã lưu/ghim) NẰM LẠI trong ngăn xếp nên nút Back quay về đúng nó,
 * giữ nguyên từ khoá/bộ lọc/vị trí cuộn ("Quay lại kết quả", app.md p1-09 §3). Trả `false` (kèm thông báo trung tính) khi
 * không dựng được route.
 */
export function openMessage(target: OpenMessageTarget): boolean {
  const href = buildMessageHref(target);
  if (!href) {
    showToast('info', 'Không mở được tin nhắn này.');
    return false;
  }
  router.push(href);
  return true;
}
