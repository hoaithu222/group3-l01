import { useMutation } from '@tanstack/react-query';

import { authService } from '@/core/api/auth';

/** Gửi mã xác minh tới email tài khoản (BE: 3 lần/15 phút). Lỗi do màn hiện trong ô nhập mã (`skipErrorToast` ở service). */
export function useSendEmailVerification() {
  return useMutation({ mutationFn: () => authService.sendEmailVerification() });
}

/**
 * Xác nhận mã 6 số. Thành công → `emailVerified` phía BE. Hồ sơ trong `useAuthStore` mang cờ `emailVerified` nhưng hook này KHÔNG
 * tự ghi vào store (`shared/` không import `shell/`) — nơi gọi cập nhật trong `onVerified` (xem `me/EmailVerifyRow`).
 */
export function useConfirmEmailVerification() {
  return useMutation({ mutationFn: (code: string) => authService.confirmEmailVerification(code) });
}
