import { useQuery } from '@tanstack/react-query';

import { getBiometricCapability, type BiometricCapability } from '@/core/auth/biometric';

/**
 * Khả năng sinh trắc học của MÁY NÀY, qua React Query để nhiều màn hình (Đăng
 * nhập, Cài đặt, lớp phủ khoá) dùng chung một lượt hỏi thay vì mỗi nơi tự gọi
 * `getBiometricCapability()`.
 *
 * ⛔ `staleTime: 0` — CỐ Ý, khác hẳn cách dùng React Query thông thường. Khả
 * năng sinh trắc học có thể đổi GIỮA CHỪNG một phiên chạy app: người dùng rời
 * app, vào Cài đặt hệ thống thêm/xoá vân tay hoặc bật lại quyền Face ID, rồi
 * quay lại. Cache dài hạn sẽ giữ kết luận "không dùng được" cũ trong khi máy đã
 * dùng được, và ngược lại.
 */
export function useBiometricCapability() {
  return useQuery<BiometricCapability>({
    queryKey: ['device', 'biometric-capability'],
    queryFn: getBiometricCapability,
    staleTime: 0,
  });
}
