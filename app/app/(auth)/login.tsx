import { LoginScreen } from '@/features/auth/screens/LoginScreen';

/**
 * File route giữ MỎNG có chủ đích — chỉ trỏ tới màn hình thật trong `features/`.
 *
 * Vì sao không viết thẳng giao diện vào đây: `app/` là bản đồ đường dẫn, đọc
 * lướt qua là biết app có những màn nào. Nhét nội dung vào thì bản đồ đó dài ra
 * hàng nghìn dòng và mất tác dụng. Ngoài ra màn hình nằm trong `features/` thì
 * test được mà không cần dựng cả bộ điều hướng.
 */
export default function LoginRoute() {
  return <LoginScreen />;
}
