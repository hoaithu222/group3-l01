import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

import { socket } from './socket.client';
import { SOCKET_AUTH_LOGOUT_CODES } from './socket.events';

export type ConnectionState = 'connected' | 'connecting' | 'offline' | 'unauthorized';

/**
 * Trạng thái kết nối realtime, gộp CẢ socket lẫn mạng máy.
 *
 * ⚠️ Đây là dữ liệu THÔ — độ trễ hiển thị (banner chỉ hiện sau 3s ở trạng thái
 * `connecting`, hiện NGAY ở `offline`) là việc của nơi dùng (`ConnectionBanner`),
 * không phải của hook này. Tách vậy để hook dùng được ở nhiều chỗ khác nhau
 * (composer màn chat cần biết `connecting` không delay — xem `app.md` §7).
 *
 * Thứ tự ưu tiên: `unauthorized` (phiên chết, banner im lặng — guard tự lo) >
 * `offline` (NetInfo xác nhận CHẮC CHẮN không có mạng) > `connected`/`connecting`.
 */
export function useConnectionState(): ConnectionState {
  const [connected, setConnected] = useState(socket.connected);
  const [online, setOnline] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setUnauthorized(false);
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err: unknown) => {
      const code = (err as { data?: { code?: string } } | undefined)?.data?.code;
      if (code && SOCKET_AUTH_LOGOUT_CODES.has(code)) setUnauthorized(true);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, []);

  useEffect(() => NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)), []);

  if (unauthorized) return 'unauthorized';
  if (!online) return 'offline';
  return connected ? 'connected' : 'connecting';
}
