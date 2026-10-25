import { Redirect, Stack } from 'expo-router';

import { PATHS } from '@/shell/config';
import { useAuthStore } from '@/shell/store/slices/auth';
import { appConfig } from '@/core/config/env.config';

/**
 * Layout của nhóm màn hình KHÁCH (chưa đăng nhập).
 *
 * Cặp đôi với hàng rào ở `app/(app)/_layout.tsx`: bên kia chặn người CHƯA đăng
 * nhập vào app, bên này chặn người ĐÃ đăng nhập quay lại màn đăng nhập.
 *
 * ⛔ Vế thứ hai không phải để cho gọn. Thiếu nó thì bấm nút Back trên Android từ
 * trang chủ sẽ về lại màn đăng nhập với một phiên vẫn còn sống — người dùng gõ
 * lại mật khẩu và lượt đăng nhập thứ hai làm backend XOAY refresh token, vô
 * hiệu hoá token mà app đang giữ. Kết quả: đăng nhập xong lại bị đá ra.
 */
export default function AuthLayout() {
  const status = useAuthStore((state) => state.status);

  if (appConfig.authEnabled && status === 'authenticated') {
    return <Redirect href={PATHS.HOME} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        /**
         * Trượt ngang giữa các màn hình xác thực — đúng ngôn ngữ chuyển động
         * của một luồng tuyến tính (đăng nhập → quên mật khẩu → đặt lại).
         * Kiểu trồi lên từ dưới (`modal`) nói "đây là việc phụ, đóng lại được",
         * sai nghĩa ở đây.
         */
        animation: 'slide_from_right',
      }}
    />
  );
}
