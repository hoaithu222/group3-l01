import { useConnectionState } from '@/core/socket';

/**
 * Máy đang MẤT MẠNG (NetInfo xác nhận chắc chắn) — màn tìm hiện "Cần kết nối để tìm" và không bắn request vô ích.
 * ⚠️ Chỉ `offline`, KHÔNG phải `connecting`: socket chưa nối không cản REST, khoá tìm chỉ vì socket đang bắt tay lại là
 * chặn người dùng vô cớ (cùng quy ước `wallet/hooks/useIsOffline`).
 */
export function useIsOffline(): boolean {
  return useConnectionState() === 'offline';
}
