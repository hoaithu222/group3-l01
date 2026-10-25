import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { AUTH_STORAGE_KEY } from '@/core/config/auth.config';
import { createPersistStorage } from '@/core/storage/app-storage';
import { decodeJwtPayload } from '@/shared/utils/jwt.utils';
import { logger } from '@/shared/utils/logger';

import { userHasPermission } from './permissions';
import type { AuthState, AuthStore } from './types';

const initialState: Omit<AuthState, 'hasHydrated'> = {
  user: null,
  token: null,
  status: 'idle',
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      hasHydrated: false,

      /**
       * Ghi dữ liệu phiên. Trạng thái SUY RA từ token sau khi ghép payload.
       *
       * ⛔ Không có token ⇒ `anonymous`, KHÔNG được giữ nguyên trạng thái cũ.
       * Nếu viết `status: state.status` thì khi `/auth/refresh` trả 200 mà thiếu
       * `accessToken` (backend sai hợp đồng — ca này có thật), trạng thái kẹt ở
       * `restoring` và màn hình chờ quay VĨNH VIỄN: không lối thoát, không thông
       * báo lỗi nào hiện ra, người dùng chỉ biết gỡ app cài lại.
       */
      setAuth: (payload) =>
        set((state) => {
          const user = payload.user !== undefined ? payload.user : state.user;
          const token = payload.token !== undefined ? payload.token : state.token;
          return { user, token, status: token ? 'authenticated' : 'anonymous' };
        }),

      setStatus: (status) => set({ status }),

      setHasHydrated: (value) => set({ hasHydrated: value }),

      /**
       * Xoá phiên trong BỘ NHỚ.
       *
       * ⛔ Cố ý KHÔNG đụng tới refresh token trong kho khoá — đó là việc của
       * `purgeSession()` ở `core/api/session.ts`. Tách đôi vì hai thao tác này
       * KHÔNG luôn đi cùng nhau: khi refresh hỏng vì mất sóng, ta xoá token
       * trong bộ nhớ để không gửi token chết đi nữa, nhưng PHẢI giữ refresh
       * token lại thì lát nữa có sóng mới khôi phục được phiên.
       */
      clearAuth: () => set({ ...initialState, status: 'anonymous' }),

      isAuthenticated: () => {
        const { token } = get();
        if (!token) return false;
        const exp = decodeJwtPayload<{ exp?: number }>(token)?.exp ?? null;
        // Token không khai `exp` → coi như còn hạn; hạn thật do máy chủ chốt (401).
        if (exp === null) return true;
        return Date.now() < exp * 1000;
      },

      hasPermission: (resource, action) => userHasPermission(get().user, resource, action),

      hasRole: (role) => get().user?.roles.includes(role) ?? false,
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createPersistStorage(),

      /**
       * ⛔ CHỈ lưu `user`.
       *
       * `token` nằm ngoài: access token trong `AsyncStorage` là văn bản trần,
       * đọc được trên máy đã root hoặc qua bản sao lưu ADB. Sau khi mở lại app,
       * token được dựng lại bằng một lượt refresh — xem `useSessionBootstrap`.
       *
       * `status` cũng nằm ngoài: khôi phục `'authenticated'` từ ổ đĩa sẽ khiến
       * guard cho qua trong khi thực tế chưa có token nào trong bộ nhớ, và màn
       * hình đầu tiên bắn một loạt request 401.
       *
       * `hasHydrated` hiển nhiên nằm ngoài — nó nói về chính lượt nạp này.
       */
      partialize: (state) => ({ user: state.user }),

      /**
       * Bật cờ `hasHydrated` khi `AsyncStorage` trả lời xong.
       *
       * ⛔ Phải bật ở CẢ HAI nhánh, kể cả khi nạp lỗi. Khi nạp lỗi, zustand gọi
       * callback với `state === undefined` — viết `state?.setHasHydrated(true)`
       * thì đúng ca đó không ai bật cờ, và app treo VĨNH VIỄN ở màn hình chờ.
       * Chỉ cần một bản dữ liệu cũ không parse được là dính (vd sau khi đổi hình
       * dạng `AuthUser` giữa hai phiên bản).
       *
       * `storeAtStart` là state lúc bắt đầu nạp — luôn có sẵn và đã mang đủ
       * actions, nên dùng làm đường lui an toàn.
       */
      onRehydrateStorage: (storeAtStart) => (state, error) => {
        if (error && __DEV__) logger.warn('[auth.store] nạp dữ liệu đã lưu hỏng:', error);
        (state ?? storeAtStart).setHasHydrated(true);
      },
    },
  ),
);
