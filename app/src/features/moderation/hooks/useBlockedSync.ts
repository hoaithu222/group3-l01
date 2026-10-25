import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { appConfig } from '@/core/config/env.config';
import { socket, SocketEvent, useSocketEvent } from '@/core/socket';
import { useBlockedUsersStore } from '@/shared/stores/blocked-users.store';
import { useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

import { moderationKeys } from '../api/moderation.keys';
import type { BlockUpdatedPayload } from '../api/moderation.types';
import { useBlocks } from '../queries/blocks.queries';

/**
 * Giữ `useBlockedIds` (store CHUNG ở `shared/`) khớp với server — mount MỘT LẦN ở
 * `app/(app)/_layout.tsx` (cùng chỗ `useConversationSocket`), không phải chỉ khi mở `me/blocked`:
 * tin của người bị chặn phải thu gọn dù người dùng chưa từng vào màn đó.
 *
 *   · Tải `GET /me/blocks` → `meta.allIds` → `hydrate()` (server là nguồn thật, thay cả tập).
 *   · `block:updated` (CHỈ tới người chặn, mọi thiết bị — BLOCK-05 ≤ 2 s) → `add`/`remove` ngay theo
 *     đúng id, rồi làm mới danh sách để `me/blocked` có tên + ngày. Áp dụng theo TẬP id nên sự kiện
 *     tới lặp (outbox at-least-once) hay tới đảo thứ tự với lượt lạc quan của chính máy này đều vô hại.
 *   · Kết nối lại socket → làm mới (đã lỡ sự kiện lúc mất mạng).
 *
 * Người BỊ chặn không nhận sự kiện nào — app không có cách nào biết mình bị ai chặn (cố ý).
 *
 * Chỉ tải khi ĐÃ CÓ PHIÊN: hook được mount trước hàng rào đăng nhập của `(app)/_layout.tsx` (Rules of Hooks), và
 * lúc chưa đăng nhập cờ capabilities cũng chưa có (`undefined`) nên cờ không chặn được — thiếu điều kiện này thì mỗi
 * lần mở app khi chưa đăng nhập là một `GET /me/blocks` không kèm token ⇒ 401 `AUTH_002`.
 *
 * Cờ `communication` tắt ⇒ BE trả lỗi cho mọi route này: không gọi (`false` chứ không phải `undefined`:
 * còn đang tải cờ thì cứ tải, để tin thu gọn đúng ngay từ khung hình đầu).
 */
export function useBlockedSync(): void {
  const queryClient = useQueryClient();
  const status = useAuthStore((state) => state.status);
  const communication = useFeature('communication');
  const signedIn = !appConfig.authEnabled || status === 'authenticated';
  const query = useBlocks({ enabled: signedIn && communication !== false });
  const allIds = query.data?.pages[0]?.meta.allIds;

  useEffect(() => {
    if (allIds) useBlockedUsersStore.getState().hydrate(allIds);
  }, [allIds]);

  useSocketEvent<BlockUpdatedPayload>(SocketEvent.BLOCK_UPDATED, (payload) => {
    const store = useBlockedUsersStore.getState();
    if (payload.added) store.add(payload.added);
    if (payload.removed) store.remove(payload.removed);
    void queryClient.invalidateQueries({ queryKey: moderationKeys.blocks });
  });

  useEffect(() => {
    const onConnect = () => void queryClient.invalidateQueries({ queryKey: moderationKeys.blocks });
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, [queryClient]);
}
