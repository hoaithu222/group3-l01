import { create } from 'zustand';

import type { ChatScopeRef, MessageMention, SendMessageAttachmentInput } from '../api/chat.types';

export type PendingMessageStatus = 'SENDING' | 'FAILED';

/** Ảnh cục bộ của bản tạm — bong bóng "đang gửi" vẽ đúng tấm ảnh người dùng vừa chọn thay vì để trống. Không gửi lên BE. */
export interface PendingPreview {
  uri: string;
  width?: number;
  height?: number;
}

/** Bản tạm trong outbox — máy trạng thái gửi tin (app.md §4.3). `DRAFT`/`SENT`/`RECONCILE` không lưu ở đây: `DRAFT` sống trong composer, `SENT` xoá khỏi outbox ngay khi cache có bản thật, `RECONCILE` vẫn hiển thị như `SENDING`. */
export interface PendingMessage {
  clientMessageId: string;
  scope: ChatScopeRef;
  status: PendingMessageStatus;
  createdAtLocal: string;
  content?: string;
  attachments?: SendMessageAttachmentInput[];
  previews?: PendingPreview[];
  mentions?: MessageMention[];
  replyToId?: string;
  /** Đã tự thử lại theo lịch (2s) chưa — chỉ tự thử lại ĐÚNG một lần (app.md §4.3). */
  autoRetried: boolean;
  failCode?: string;
  failMessage?: string;
  /** `MSG_008`: userId các chip bị từ chối — "Sửa" nạp lại composer với đúng các chip này tô đỏ. */
  failInvalidMentionUserIds?: string[];
  /** Epoch ms — bật lại nút "Thử lại" sau mốc này (429 `RATE_002`). */
  retryAfterAt?: number;
}

const FAILED_TTL_MS = 24 * 60 * 60 * 1000;

interface OutboxStoreShape {
  byScope: Record<string, PendingMessage[]>;
  add: (scopeKey: string, message: PendingMessage) => void;
  update: (scopeKey: string, clientMessageId: string, patch: Partial<PendingMessage>) => void;
  remove: (scopeKey: string, clientMessageId: string) => void;
  clear: () => void;
}

function pruneExpiredFailed(list: PendingMessage[]): PendingMessage[] {
  const now = Date.now();
  return list.filter((m) => m.status !== 'FAILED' || now - new Date(m.createdAtLocal).getTime() < FAILED_TTL_MS);
}

/**
 * `scopeKey → PendingMessage[]` — bộ nhớ THUẦN (P0, không persist), xoá khi
 * logout qua `resetChatStores()`. FAILED sống hết PHIÊN (kể cả rời màn quay
 * lại) nhưng quá 24h thì tự dọn (app.md §5).
 */
export const useOutboxStore = create<OutboxStoreShape>((set) => ({
  byScope: {},

  add: (scopeKey, message) =>
    set((state) => {
      const current = pruneExpiredFailed(state.byScope[scopeKey] ?? []);
      return { byScope: { ...state.byScope, [scopeKey]: [...current, message] } };
    }),

  update: (scopeKey, clientMessageId, patch) =>
    set((state) => {
      const current = state.byScope[scopeKey];
      if (!current) return state;
      return {
        byScope: {
          ...state.byScope,
          [scopeKey]: current.map((m) => (m.clientMessageId === clientMessageId ? { ...m, ...patch } : m)),
        },
      };
    }),

  remove: (scopeKey, clientMessageId) =>
    set((state) => {
      const current = state.byScope[scopeKey];
      if (!current) return state;
      return { byScope: { ...state.byScope, [scopeKey]: current.filter((m) => m.clientMessageId !== clientMessageId) } };
    }),

  clear: () => set({ byScope: {} }),
}));
