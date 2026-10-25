import type { ChatScopeRef, ChatScopeType } from './chat.types';

/** Khoá query của `chat` (app.md p1-04 §4.1) — dùng chung cho MỌI scope (CHANNEL/CONVERSATION). */
export const chatKeys = {
  all: ['chat'] as const,
  scope: (s: ChatScopeRef) => [...chatKeys.all, s.scopeType, s.scopeId, s.threadId ?? 'root'] as const,
  messages: (s: ChatScopeRef) => [...chatKeys.scope(s), 'messages'] as const,
  /** View tạm khi mở quanh một tin không có sẵn trong `messages` (app.md §3 "Jump/around") — KHÔNG đồng bộ socket. */
  around: (s: ChatScopeRef, messageId: string) => [...chatKeys.scope(s), 'around', messageId] as const,
  pins: (s: ChatScopeRef) => [...chatKeys.scope(s), 'pins'] as const,
  reactors: (messageId: string, emoji: string) => [...chatKeys.all, 'reactors', messageId, emoji] as const,
  /** Người nhận DM của `ForwardSheet` — theo từ khoá tìm, không theo tin đang chuyển tiếp. */
  forwardPeople: (q: string) => [...chatKeys.all, 'forward-people', q] as const,
  /** Gợi ý nhắc tên — theo PHẠM VI (kênh/hội thoại), KHÔNG theo luồng: người nhắc được trong luồng chính là người nhắc được trong kênh. */
  mentionables: (scopeType: ChatScopeType, scopeId: string, q: string) =>
    [...chatKeys.all, 'mentionables', scopeType, scopeId, q] as const,
};
