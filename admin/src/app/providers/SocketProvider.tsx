import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { CAPABILITIES_KEY } from '@/app/capabilities';
import { useAuthStore } from '@/app/store';
import {
  connectSocket,
  disconnectSocket,
  resetRoomSubscriptions,
  SocketEvent,
  useSocketEvent,
} from '@/core/socket';

interface SocketProviderProps {
  children: ReactNode;
}

/**
 * Vòng đời Socket.IO của toàn app.
 *
 * Đặt ở tầng PROVIDER (bọc `<AppRouter>`, không phải một layout con) — vòng
 * đời socket đi theo PHIÊN ĐĂNG NHẬP, không đi theo route đang mount. Đặt
 * trong layout thì chuyển giữa hai route khác layout (vd `/login` ↔ shell đã
 * đăng nhập) sẽ vô tình ngắt/nối lại kết nối đang tốt.
 *
 * `useLogout` (`features/auth/service/auth.queries.ts`) ngắt socket TRƯỚC khi
 * `clearAuth()` — effect ở đây vẫn là lưới an toàn thứ hai (F5 mất phiên do
 * refresh hỏng, tab khác đăng xuất qua `useMultiTabSync`…).
 */
export default function SocketProvider({ children }: SocketProviderProps) {
  const status = useAuthStore((s) => s.status);
  const queryClient = useQueryClient();

  /**
   * `resetRoomSubscriptions()` khi RỜI trạng thái đăng nhập (p0-03) — registry
   * phòng của phiên cũ (nếu không xoá) sẽ khiến lượt `rejoinAll()` sau lần
   * đăng nhập KẾ TIẾP (tài khoản khác trên cùng máy) cố `room:join` lại những
   * phòng của người dùng TRƯỚC. Rejoin khi CÓ kết nối lại không cần gọi gì ở
   * đây — `useRoomSubscription.ts` tự đăng ký `socket.on('connect', rejoinAll)`
   * lúc module được nạp (side-effect, cùng vòng đời `core/socket`).
   */
  useEffect(() => {
    if (status === 'authenticated') {
      connectSocket();
    } else {
      disconnectSocket();
      resetRoomSubscriptions();
    }
  }, [status]);

  /**
   * Quyền vừa bị thu hồi (đổi role, khoá tài khoản, gỡ quyền workspace…) — BE
   * bắn sự kiện này tới đúng `user:{id}` của người bị ảnh hưởng. Admin có ít
   * cache scope nên invalidate TOÀN CỤC là đơn giản và an toàn hơn dò từng
   * `queryKey` liên quan (thiếu 1 key là UI đứng yên dữ liệu đã hết quyền xem).
   */
  useSocketEvent(SocketEvent.PERMISSION_REVOKED, () => {
    void queryClient.invalidateQueries();
  });

  /**
   * Admin (kể cả người khác) vừa sửa `SystemConfig` — BE gộp nhiều thay đổi
   * trong 2 s thành MỘT sự kiện. Làm mới capabilities (registry lọc module theo
   * cờ) và trang `system-config` (thấy thay đổi của admin khác).
   */
  useSocketEvent(SocketEvent.CONFIG_UPDATED, () => {
    void queryClient.invalidateQueries({ queryKey: CAPABILITIES_KEY });
    void queryClient.invalidateQueries({ queryKey: ['system-config'] });
  });

  return <>{children}</>;
}
