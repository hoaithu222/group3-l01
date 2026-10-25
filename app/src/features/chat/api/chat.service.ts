import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { toMentionInputs } from '../mentions/mention-markup';
import type {
  ChatScopeRef,
  EditMessagePayload,
  ForwardMessagePayload,
  ForwardPerson,
  ForwardResult,
  HideResult,
  ListMessagesMeta,
  MessagesPage,
  MessageView,
  PinResult,
  ReactionResult,
  ReactorEntry,
  ReactorPage,
  SendMessagePayload,
} from './chat.types';

const scopePath = (s: ChatScopeRef) => `/scopes/${s.scopeType}/${s.scopeId}/messages`;
const msgPath = (id: string) => `/messages/${id}`;

export interface ListMessagesParams {
  beforeSeq?: number;
  afterSeq?: number;
  around?: string;
  threadId?: string;
  limit?: number;
}

/**
 * Gọi thẳng `apiClient` theo be.md §4 — path thật (`/scopes/:scopeType/:scopeId/messages`,
 * `/messages/:id`, …), KHÔNG qua alias `/channels/:id/messages`: alias chỉ để
 * tiện test/curl phía BE, `chat` là engine dùng chung nên luôn gọi path tổng quát.
 */
export const chatService = {
  /**
   * ⛔ KHÔNG dùng `unwrapData`: BE trả `{ data: MessageView[], meta, anchorMessageId? }`
   * ngay ở gốc thân phản hồi, `unwrapData` bóc `.data` và VỨT `meta` — `useMessages`
   * sau đó đọc `page.meta.hasMoreAfter` trên một mảng trần và nổ. Đọc thẳng
   * `response.data` (cùng cách `members.service.ts`/`channels.service.ts` làm).
   */
  async list(scope: ChatScopeRef, params: ListMessagesParams): Promise<MessagesPage> {
    const response = await apiClient.get<{ data: MessageView[]; meta: ListMessagesMeta; anchorMessageId?: string }>(
      scopePath(scope),
      { params: { ...params, threadId: scope.threadId } },
    );
    const { data, meta, anchorMessageId } = response.data;
    return { data, meta, ...(anchorMessageId && { anchorMessageId }) };
  },

  async send(scope: ChatScopeRef, payload: SendMessagePayload): Promise<MessageView> {
    const response = await apiClient.post<MessageView>(scopePath(scope), {
      ...payload,
      mentions: toMentionInputs(payload.mentions),
      threadRootId: payload.threadRootId ?? scope.threadId,
    });
    return unwrapData<MessageView>(response);
  },

  async get(messageId: string): Promise<MessageView> {
    const response = await apiClient.get<MessageView>(msgPath(messageId));
    return unwrapData<MessageView>(response);
  },

  async edit(messageId: string, payload: EditMessagePayload): Promise<MessageView> {
    // `mentions` PHẢI đi kèm mỗi lần sửa: BE mặc định `[]`, mà `content` còn nguyên marker `@{u:…}` ⇒ `MSG_008 MISMATCH`.
    const response = await apiClient.patch<MessageView>(msgPath(messageId), {
      ...payload,
      mentions: toMentionInputs(payload.mentions),
    });
    return unwrapData<MessageView>(response);
  },

  async recall(messageId: string, reason?: string): Promise<{ id: string; seq: number; deletedAt: string }> {
    const response = await apiClient.delete<{ id: string; seq: number; deletedAt: string }>(msgPath(messageId), {
      data: reason ? { reason } : undefined,
    });
    return unwrapData(response);
  },

  async hide(messageId: string): Promise<HideResult> {
    const response = await apiClient.post<HideResult>(`${msgPath(messageId)}/hide`);
    return unwrapData<HideResult>(response);
  },

  async unhide(messageId: string): Promise<HideResult> {
    const response = await apiClient.delete<HideResult>(`${msgPath(messageId)}/hide`);
    return unwrapData<HideResult>(response);
  },

  async react(messageId: string, emoji: string): Promise<ReactionResult> {
    const response = await apiClient.put<ReactionResult>(
      `${msgPath(messageId)}/reactions/${encodeURIComponent(emoji)}`,
    );
    return unwrapData<ReactionResult>(response);
  },

  async unreact(messageId: string, emoji: string): Promise<ReactionResult> {
    const response = await apiClient.delete<ReactionResult>(
      `${msgPath(messageId)}/reactions/${encodeURIComponent(emoji)}`,
    );
    return unwrapData<ReactionResult>(response);
  },

  /** Cùng bẫy `unwrapData` với `list`: BE trả `{ data: entries[], meta: { nextCursor, hasMore } }`. */
  async listReactors(messageId: string, emoji?: string, cursor?: string): Promise<ReactorPage> {
    const response = await apiClient.get<{ data: ReactorEntry[]; meta: { nextCursor: string | null } }>(
      `${msgPath(messageId)}/reactions`,
      { params: { emoji, cursor } },
    );
    return { data: response.data.data, cursor: response.data.meta.nextCursor };
  },

  async pin(messageId: string): Promise<PinResult> {
    const response = await apiClient.post<PinResult>(`${msgPath(messageId)}/pin`);
    return unwrapData<PinResult>(response);
  },

  async unpin(messageId: string): Promise<PinResult> {
    const response = await apiClient.delete<PinResult>(`${msgPath(messageId)}/pin`);
    return unwrapData<PinResult>(response);
  },

  async listPins(scope: ChatScopeRef): Promise<MessageView[]> {
    const response = await apiClient.get<MessageView[]>(`/scopes/${scope.scopeType}/${scope.scopeId}/pins`, { skipErrorToast: true });
    return unwrapData<MessageView[]>(response);
  },

  async forward(messageId: string, payload: ForwardMessagePayload): Promise<ForwardResult> {
    const response = await apiClient.post<ForwardResult>(`${msgPath(messageId)}/forward`, payload);
    return unwrapData<ForwardResult>(response);
  },

  /**
   * Người có thể nhắn riêng — `ForwardSheet` chọn đích DM. Gọi thẳng endpoint của
   * `conversations` (p1-05) mà KHÔNG import feature đó (`feature-structure.md`),
   * cùng mẫu `channelsService.searchWorkspaceMembers`. `skipErrorToast`: lỗi tìm
   * kiếm chỉ làm danh sách rỗng, không đáng một toast giữa lúc đang gõ.
   */
  async searchPeople(q: string): Promise<ForwardPerson[]> {
    const response = await apiClient.get<ForwardPerson[]>('/conversations/people', {
      params: { q },
      skipErrorToast: true,
    });
    return unwrapData<ForwardPerson[]>(response).map(({ userId, name, avatarUrl }) => ({ userId, name, avatarUrl }));
  },
};
