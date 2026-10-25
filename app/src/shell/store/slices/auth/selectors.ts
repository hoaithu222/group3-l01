/**
 * Selector cho auth store.
 *
 * Dùng selector thay vì đọc cả store để component chỉ vẽ lại khi đúng mẩu dữ
 * liệu nó cần đổi:
 *
 *   const user = useAuthStore(selectUser);   // ✅ đổi tên user mới vẽ lại
 *   const { user } = useAuthStore();         // ❌ vẽ lại mọi lượt store đổi
 */
import type { AuthStore } from './types';

export const selectUser = (state: AuthStore) => state.user;
export const selectToken = (state: AuthStore) => state.token;
export const selectStatus = (state: AuthStore) => state.status;
export const selectHasHydrated = (state: AuthStore) => state.hasHydrated;

export const selectIsAuthenticated = (state: AuthStore) => state.isAuthenticated();

export const selectUserId = (state: AuthStore) => state.user?.id ?? null;
export const selectUserEmail = (state: AuthStore) => state.user?.email ?? null;
export const selectUserName = (state: AuthStore) => state.user?.name ?? null;
export const selectUserAvatar = (state: AuthStore) => state.user?.avatar ?? null;
export const selectUserRoles = (state: AuthStore) => state.user?.roles ?? [];

/**
 * ⛔ Trả về object MỚI mỗi lần gọi — chỉ dùng kèm `useShallow`:
 *
 *   const { setAuth, clearAuth } = useAuthStore(useShallow(selectAuthActions));
 *
 * Gọi trần sẽ khiến component vẽ lại ở MỌI lượt store đổi, vì object mới luôn
 * khác object cũ theo phép so sánh tham chiếu.
 */
export const selectAuthActions = (state: AuthStore) => ({
  setAuth: state.setAuth,
  setStatus: state.setStatus,
  clearAuth: state.clearAuth,
});
