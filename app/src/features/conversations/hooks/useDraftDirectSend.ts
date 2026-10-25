import { useState } from 'react';
import { router } from 'expo-router';

import { toErrorMessage } from '@/core/api/client.helpers';
import { scopeKeyOf } from '@/core/socket';
import { newClientMessageId, useOutboxStore } from '@/features/chat';

import { conversationsService } from '../api/conversations.service';
import { useConversationDraftTargetStore } from '../store/conversation-draft-target.store';
import { getErrorCode } from '../utils/error-details';

export interface DraftSendState {
  sending: boolean;
  error?: string;
}

/**
 * app.md §3/§4.3 — "gửi đầu → POST /conversations/direct → POST messages →
 * router.replace giữ bong bóng". Đơn giản hoá CÓ CHỦ ĐÍCH so với `ChatRoom`
 * thật: không có bong bóng SENDING lạc quan trong lúc chờ mạng (composer nháp
 * chỉ có MỘT tin, mất vài trăm ms không đáng phần phức tạp của một outbox
 * riêng) — nhưng lỗi SAU KHI hội thoại đã tồn tại vẫn phải điều hướng sang màn
 * thật kèm bong bóng FAILED có "Thử lại" hoạt động (dùng CHUNG cơ chế outbox
 * của `ChatRoom` — `@/features/chat` xuất `useOutboxStore`/`newClientMessageId`
 * đúng cho việc này, xem chú thích ở `chat/index.ts`).
 */
export function useDraftDirectSend(peerUserId: string) {
  const [state, setState] = useState<DraftSendState>({ sending: false });
  const setTarget = useConversationDraftTargetStore((s) => s.setTarget);
  const draftKey = `draft:${peerUserId}`;

  async function send(content: string): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed || state.sending) return;
    setState({ sending: true });

    let conversationId: string;
    try {
      const known = useConversationDraftTargetStore.getState().byDraftKey[draftKey];
      if (known) {
        conversationId = known;
      } else {
        const { detail } = await conversationsService.createDirect(peerUserId);
        conversationId = detail.id;
        setTarget(draftKey, conversationId);
      }
    } catch (error) {
      setState({ sending: false, error: toErrorMessage(error) });
      return;
    }

    const clientMessageId = newClientMessageId();
    try {
      await conversationsService.sendFirstMessage(conversationId, { clientMessageId, content: trimmed });
    } catch (error) {
      useOutboxStore.getState().add(scopeKeyOf('CONVERSATION', conversationId), {
        clientMessageId,
        scope: { scopeType: 'CONVERSATION', scopeId: conversationId },
        status: 'FAILED',
        createdAtLocal: new Date().toISOString(),
        content: trimmed,
        autoRetried: true,
        failCode: getErrorCode(error),
        failMessage: toErrorMessage(error),
      });
    }
    setState({ sending: false });
    router.replace({ pathname: '/messages/[conversationId]', params: { conversationId } });
  }

  return { ...state, send };
}
