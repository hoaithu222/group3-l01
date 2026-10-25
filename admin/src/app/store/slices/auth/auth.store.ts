import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { decodeJwtPayload } from '@/shared/utils/browser/jwt.utils';
import type { AuthStoreType, AuthState } from './types';
import { AUTH_STORAGE_KEY } from '@/core/config/auth.config';
import { normalizeAuthUser, SUPER_ROLE } from './auth.utils';

const initialState: AuthState = {
  user: null,
  token: null,
  status: 'idle',
  endReason: null,
};

// Lấy từ hằng số chung — viết cứng lại chuỗi ở đây thì đổi một bên là state
// persist tách làm đôi trong im lặng.
const STORAGE_KEY = AUTH_STORAGE_KEY;

export const useAuthStore = create<AuthStoreType>()(
  persist(
    (set, get) => ({
      ...initialState,

      /**
       * Ghi dữ liệu phiên. Trạng thái suy ra từ token SAU khi ghép payload.
       *
       * ⛔ Không có token ⇒ `anonymous`, KHÔNG được giữ nguyên trạng thái cũ.
       * Bản trước viết `: state.status`, nên khi `/auth/refresh` trả 200 mà
       * thiếu `accessToken` (BE sai hợp đồng — `session.ts` xác nhận ca này có
       * thật), trạng thái kẹt ở `restoring` và `AuthGuard` quay spinner VĨNH
       * VIỄN: không lối thoát, không thông báo lỗi nào hiện ra.
       *
       * Hồ sơ đi qua `normalizeAuthUser`: mọi nơi gọi `setAuth` đều nhận DTO thô
       * của BE, và một mảng `roles`/`permissions` bị thiếu là màn trắng.
       */
      setAuth: (payload) =>
        set((state) => {
          const user = payload.user !== undefined ? normalizeAuthUser(payload.user) : state.user;
          const token = payload.token !== undefined ? payload.token : state.token;
          return {
            user,
            token,
            status: token ? 'authenticated' : 'anonymous',
            // Đã có phiên mới thì lời nhắn "phiên cũ đã hết hạn" hết ý nghĩa.
            endReason: token ? null : state.endReason,
          };
        }),

      setStatus: (status) => set({ status }),

      clearAuth: (reason = null) => set({ ...initialState, status: 'anonymous', endReason: reason }),

      dismissEndReason: () => set({ endReason: null }),

      isAuthenticated: () => {
        const { token } = get();
        if (!token) return false;
        const exp = decodeJwtPayload<{ exp?: number }>(token)?.exp ?? null;
        // Token không khai `exp` → coi như còn hạn; hạn thật do BE chốt (401).
        if (exp === null) return true;
        return Date.now() < exp * 1000;
      },

      hasPermission: (resource, action) => {
        const { user } = get();
        if (!user) return false;
        if (user.roles.includes(SUPER_ROLE)) return true;
        return user.permissions.includes(`${resource}:${action}`);
      },

      hasRole: (role) => get().user?.roles.includes(role) ?? false,
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      /**
       * ⛔ CHỈ persist `user`.
       *
       * `token` cố ý nằm ngoài: access token trong localStorage là thứ mà bất
       * kỳ lỗ hổng XSS nào cũng đọc được. Sau F5, token được dựng lại bằng một
       * lượt gọi refresh (cookie HttpOnly tự gửi kèm) — xem `AuthGuard`.
       *
       * `status` cũng nằm ngoài: khôi phục `'authenticated'` từ ổ đĩa sẽ khiến
       * guard cho qua trong khi thực tế chưa có token nào trong bộ nhớ.
       *
       * `user` đã lưu đóng vai "dấu hiệu từng đăng nhập": `useSessionBootstrap`
       * dựa vào nó để phân biệt "chưa từng đăng nhập" với "phiên có thể còn".
       */
      partialize: (state) => ({ user: state.user }),
      /**
       * Đọc lại từ localStorage KHÔNG được tin: bản lưu cũ/bị sửa tay thiếu mảng
       * `roles`/`permissions` sẽ làm `hasPermission` ném lỗi ngay lúc render đầu.
       * Chuẩn hoá lại, hỏng thì coi như chưa có hồ sơ.
       */
      merge: (persisted, current) => ({
        ...current,
        user: normalizeAuthUser((persisted as { user?: unknown } | null | undefined)?.user),
      }),
    },
  ),
);
