import { createContext, useContext, useMemo, type ReactNode } from 'react';

/** Trạng thái mà màn xác thực muốn hình đầu màn (`AuthHero`, quyển sách) phản ánh. */
export interface AuthHeroState {
  /** Gập sách lại — màn Đăng nhập bật khi ô MẬT KHẨU đang nhận bàn phím ("che mắt" như chú gấu của các màn login). */
  closed: boolean;
  /** Đang hiện dải lỗi của form — sườn LÊN (`false` → `true`) làm sách lắc ngang MỘT lần. */
  hasError: boolean;
}

const DEFAULT_STATE: AuthHeroState = { closed: false, hasError: false };

const AuthHeroContext = createContext<AuthHeroState>(DEFAULT_STATE);

/**
 * Kênh nối màn xác thực với `AuthHero` mà KHÔNG thêm prop vào `AuthScreenLayout` (khung chung có luật "⛔ Đừng thêm prop
 * mới vào đây"). Màn nào cần sách phản ứng theo form thì bọc NGOÀI `AuthScreenLayout`:
 *
 * ```tsx
 * <AuthHeroProvider closed={passwordFocused} hasError={displayError !== null}>
 *   <AuthScreenLayout title="…">…</AuthScreenLayout>
 * </AuthHeroProvider>
 * ```
 *
 * ✅ Không có provider ⇒ giá trị mặc định: sách MỞ, không lắc — Đăng ký, Quên/Đặt lại mật khẩu, Khôi phục tài khoản và
 * màn khoá ứng dụng giữ nguyên hành vi, không màn nào phải biết tới kênh này. (Khác `RadioGroup`: thiếu provider ở đây là
 * ca HỢP LỆ nên không ném lỗi.)
 */
export function AuthHeroProvider({
  children,
  closed = false,
  hasError = false,
}: Partial<AuthHeroState> & { children: ReactNode }) {
  // Giữ tham chiếu ổn định: `AuthHero` chỉ vẽ lại khi một trong hai cờ đổi, không phải mỗi ký tự gõ vào form.
  const value = useMemo(() => ({ closed, hasError }), [closed, hasError]);
  return <AuthHeroContext.Provider value={value}>{children}</AuthHeroContext.Provider>;
}

export function useAuthHero(): AuthHeroState {
  return useContext(AuthHeroContext);
}
