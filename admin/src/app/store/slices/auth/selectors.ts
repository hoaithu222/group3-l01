/**
 * Selector cho auth store.
 *
 * Dùng selector thay vì đọc cả store để component chỉ re-render khi đúng
 * mẩu dữ liệu nó cần đổi:
 *   const user = useAuthStore(selectUser);
 */

import { hasAdminAccess } from './auth.utils';
import type { AuthStoreType } from './types';

export const selectUser = (state: AuthStoreType) => state.user;
export const selectToken = (state: AuthStoreType) => state.token;
export const selectStatus = (state: AuthStoreType) => state.status;
export const selectEndReason = (state: AuthStoreType) => state.endReason;

/**
 * ⛔ Đây là "token còn hạn theo `exp`", KHÔNG phải "đang có phiên". Guard route
 * dùng `selectStatus === 'authenticated'`: access token sống 15 phút và được làm
 * mới lười (khi ăn 401), nên token hết hạn vẫn là phiên còn sống — dùng selector
 * này làm cổng là đá người dùng ra đăng nhập dù cookie refresh còn 7 ngày.
 */
export const selectIsAuthenticated = (state: AuthStoreType) => state.isAuthenticated();

/** Được phép vào trang quản trị (admin, hoặc có ít nhất một quyền) — xem `hasAdminAccess`. */
export const selectCanAccessAdmin = (state: AuthStoreType) => hasAdminAccess(state.user);

export const selectUserId = (state: AuthStoreType) => state.user?.id ?? null;
export const selectUserEmail = (state: AuthStoreType) => state.user?.email ?? null;
export const selectUserName = (state: AuthStoreType) => state.user?.name ?? null;
export const selectUserAvatar = (state: AuthStoreType) => state.user?.avatar ?? null;
export const selectUserRoles = (state: AuthStoreType) => state.user?.roles ?? [];

/**
 * ⛔ Trả về object MỚI mỗi lần gọi — chỉ dùng với `useShallow`:
 *   const { setAuth, clearAuth } = useAuthStore(useShallow(selectAuthActions));
 * Gọi trần sẽ khiến component re-render mọi lượt store đổi.
 */
export const selectAuthActions = (state: AuthStoreType) => ({
  setAuth: state.setAuth,
  setStatus: state.setStatus,
  clearAuth: state.clearAuth,
});
