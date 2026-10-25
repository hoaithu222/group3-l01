import { useMemo } from 'react';

import { useAuthStore } from '@/shell/store/slices/auth';

import { SocketEvent } from '../socket.events';
import { useSocketEvent } from '../use-socket-event';
import { scopeKeyOf, useTypingStore } from './typing.store';

export interface TypingPayload {
  scopeId: string;
  scopeType: string;
  serverNow: number;
  state: 'start' | 'stop';
  threadId?: string;
  userId: string;
  v: number;
}

/**
 * Danh sách `userId` đang gõ trong một scope (hội thoại/kênh, kèm `threadId`
 * nếu lồng luồng). Tự đăng ký nghe sự kiện `typing` — nhiều component cùng gọi
 * cho CÙNG scope thì mỗi component có một listener riêng, không tranh nhau.
 */
export function useTypingIndicator(scopeType: string, scopeId: string, threadId?: string): string[] {
  const scopeKey = scopeKeyOf(scopeType, scopeId, threadId);
  const currentUserId = useAuthStore((state) => state.user?.id);

  useSocketEvent<TypingPayload>(SocketEvent.TYPING, (payload) => {
    // ⛔ Bỏ qua sự kiện của CHÍNH MÌNH — server echo lại `typing:start` của
    // chính người gõ tới mọi thành viên phòng (kể cả người gửi), và không lọc
    // ở đây thì người dùng thấy chính họ hiện trong danh sách "đang gõ".
    if (payload.userId === currentUserId) return;
    if (scopeKeyOf(payload.scopeType, payload.scopeId, payload.threadId) !== scopeKey) return;

    if (payload.state === 'start') useTypingStore.getState().add(scopeKey, payload.userId);
    else useTypingStore.getState().remove(scopeKey, payload.userId);
  });

  // Selector trả về tham chiếu ổn định (`byScope[scopeKey]` chỉ đổi khi ĐÚNG
  // scope này đổi — xem `typing.store.ts`), `Object.keys` tách ra `useMemo` để
  // không tạo mảng MỚI ở mọi lần render khi dữ liệu chưa đổi.
  const scopeEntries = useTypingStore((state) => state.byScope[scopeKey]);
  return useMemo(() => Object.keys(scopeEntries ?? {}), [scopeEntries]);
}
