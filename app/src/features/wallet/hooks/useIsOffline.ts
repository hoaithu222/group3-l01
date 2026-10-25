import { useConnectionState } from '@/core/socket';

/**
 * Máy đang mất mạng (NetInfo) — nút GHI tiền khoá với nhãn "Kết nối lại để lưu".
 * ⚠️ Chỉ `offline`, KHÔNG phải `connecting`: socket chưa nối không cản REST, và
 * khoá nút chỉ vì socket đang bắt tay lại là chặn người dùng vô cớ. Xem
 * `useConnectionState` để phân biệt bốn trạng thái.
 */
export function useIsOffline(): boolean {
  return useConnectionState() === 'offline';
}
