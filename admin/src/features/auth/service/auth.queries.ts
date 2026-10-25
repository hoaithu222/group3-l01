/**
 * React Query hooks cho luồng đăng nhập.
 *
 * Mutation KHÔNG tự điều hướng — trang gọi quyết định đi đâu, vì đích phụ
 * thuộc deep-link người dùng bấm trước khi bị đá ra `/login`.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { authService } from '@/core/api/auth';
import type {
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from '@/core/api/auth';
import { isConnectivityError } from '@/core/api/error.handler';
import { purgeAuthSession } from '@/core/api/session';
import { announceSessionStarted } from '@/core/api/session.sync';
import { useAuthStore } from '@/app/store';
import { disconnectSocket } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';

export const useLogin = () => {
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LoginRequest) => authService.login(payload),
    onSuccess: (res) => {
      // Cache còn sót từ phiên trước (hết hạn, tab khác, người khác dùng chung máy) không
      // được lọt sang người vừa đăng nhập. Xoá TRƯỚC khi ghi phiên mới để không có khung
      // hình nào hiện dữ liệu cũ dưới danh tính mới.
      queryClient.clear();
      setAuth({ user: res.data.user, token: res.data.accessToken });
      // Tab khác đang ở trang đăng nhập nên khôi phục phiên (cùng cookie).
      announceSessionStarted();
    },
  });
};

export const useRegister = () =>
  useMutation({
    mutationFn: (payload: RegisterRequest) => authService.register(payload),
    onSuccess: () => showToast('success', 'Tạo tài khoản thành công'),
  });

export const useForgotPassword = () =>
  useMutation({
    mutationFn: (payload: ForgotPasswordRequest) => authService.forgotPassword(payload),
  });

export const useResetPassword = () =>
  useMutation({
    mutationFn: (payload: ResetPasswordRequest) => authService.resetPassword(payload),
    onSuccess: () => showToast('success', 'Đặt lại mật khẩu thành công'),
  });

export const useChangePassword = () => {
  const setAuth = useAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: (payload: ChangePasswordRequest) => authService.changePassword(payload),
    onSuccess: (res) => {
      // BE nâng `sessionVersion` khi đổi mật khẩu ⇒ token đang giữ thành token CŨ (401 `AUTH_004`).
      // Phiên hiện tại được giữ và BE cấp sẵn token mới: nhận ngay để request kế tiếp (và lần
      // nối lại socket — BE ngắt socket sau khi đổi mật khẩu) khỏi đi vòng 401 → refresh → phát lại.
      // Chỉ nhận khi phiên còn sống: phiên đã bị dọn trong lúc chờ (tab khác đăng xuất, bị khoá)
      // thì một phản hồi đến trễ không được hồi sinh nó.
      const token = res.data?.accessToken;
      if (token && useAuthStore.getState().status === 'authenticated') setAuth({ token });
    },
  });
};

export const useLogout = () =>
  useMutation({
    mutationFn: () => authService.logout(),
    // Dù BE lỗi vẫn phải xoá phiên phía client — người dùng đã bấm đăng xuất.
    onSettled: (_data, error) => {
      // Ngắt TRƯỚC khi xoá store: `SocketProvider` cũng tự ngắt theo `status`
      // đổi, nhưng ngắt tường minh ở đây tránh một khung hình socket còn mở
      // với token vừa bị BE thu hồi (đăng xuất gọi `revokeAll` phía server).
      disconnectSocket();
      /**
       * MỘT hàm dọn cho mọi cách kết thúc phiên (`purgeAuthSession`): xoá store, XOÁ
       * React Query cache, và báo các tab khác. ⛔ Cache BẮT BUỘC phải dọn — `clearAuth()`
       * chỉ đụng tới Zustand, nên không dọn thì người thứ hai đăng nhập trên CÙNG tab sẽ
       * thấy ngay dữ liệu của người trước hiện ra trước khi refetch kịp chạy. `clear()`
       * chứ không `invalidateQueries()`: invalidate chỉ đánh dấu cũ mà VẪN giữ dữ liệu để
       * hiển thị trong lúc tải lại — đúng thứ phải tránh.
       *
       * `null` = tự thoát: đừng hiện "phiên đã hết hạn" ở trang đăng nhập.
       */
      purgeAuthSession(null);

      // Đứt mạng / BE chết lúc thoát: trình duyệt này đã sạch, nhưng phiên phía MÁY CHỦ
      // vẫn sống và cookie refresh vẫn nằm trong trình duyệt — mở lại là tự đăng nhập.
      // Trên máy dùng chung, người dùng cần biết điều đó.
      if (isConnectivityError(error)) {
        showToast(
          'warning',
          'Đã thoát khỏi trình duyệt này nhưng chưa thu hồi được phiên trên máy chủ (mất kết nối).',
          { duration: 8000 },
        );
      }
    },
  });
