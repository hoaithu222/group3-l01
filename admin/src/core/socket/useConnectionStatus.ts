import { useEffect, useState } from 'react';

import { socket } from './socket.client';

export type ConnectionStatus = 'connected' | 'connecting';

/**
 * Trạng thái kết nối realtime rút gọn — dùng cho chấm nhỏ cạnh avatar ở header
 * (`p0-03 admin.md §2`: "Realtime: đã kết nối / đang kết nối lại"), KHÔNG chặn
 * thao tác nào.
 *
 * CHỈ 2 mức, khác `use-connection-state.ts` của app (4 mức, có `offline` từ
 * `NetInfo` và `unauthorized` riêng) — admin không có API mạng máy kiểu app,
 * và phiên chết thật đã bị `socket.auth-sync.ts` dọn (`purgeAuthSession()` → guard
 * điều hướng ra khỏi shell → header không còn render; lỗi bắt tay chỉ vì token hết hạn
 * thì được thử làm mới trước), nên hook này không cần phân biệt thêm nhánh đó.
 */
export function useConnectionStatus(): ConnectionStatus {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return connected ? 'connected' : 'connecting';
}
