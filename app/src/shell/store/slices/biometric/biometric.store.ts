import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createPersistStorage } from '@/core/storage/app-storage';
import { logger } from '@/shared/utils/logger';

import type { BiometricState, BiometricStore } from './types';

/**
 * Store gắn kết đăng nhập sinh trắc học — persist ở `AsyncStorage`
 * (`auth.biometric-binding.v1`), KHÔNG phải kho khoá: xem `types.ts` cho lý do
 * dữ liệu này không nhạy cảm.
 */

const initialState: BiometricState = {
  binding: null,
  hasHydrated: false,
};

export const useBiometricStore = create<BiometricStore>()(
  persist(
    (set) => ({
      ...initialState,

      setBinding: (binding) => set({ binding }),

      clearBinding: () => set({ binding: null }),

      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: 'auth.biometric-binding.v1',
      storage: createPersistStorage(),
      partialize: (state) => ({ binding: state.binding }),

      /**
       * ⛔ Bật `hasHydrated` ở CẢ HAI nhánh (kể cả lỗi) — giống hệt lý do ở
       * `auth.store.ts`: một bản JSON hỏng không được phép treo app ở màn hình
       * chờ vĩnh viễn. `useSessionBootstrap` còn tự đặt thêm một TRẦN 3 giây
       * (`waitForBiometricHydration`) phòng khi chính callback này không chạy.
       *
       * Sau khi hydrate xong: binding đã QUÁ HẠN (`expiresAt` ở quá khứ) thì gỡ
       * NGAY tại đây — "hết hạn ⇒ gỡ lúc hydrate" (`app.md` §5). Chỉ xoá phần
       * STATE; xoá bí mật + báo BE là việc của `disableBiometric()`, và ở đây
       * cố ý KHÔNG gọi nó để tránh vòng phụ thuộc (`reconcile.ts` import
       * ngược lại store này) — bí mật hết hạn cục bộ chỉ là dọn dẹp, còn BE
       * cũng tự đánh dấu `EXPIRED` qua job `auth.biometric-cleanup` của nó.
       */
      onRehydrateStorage: (storeAtStart) => (state, error) => {
        if (error && __DEV__) {
          logger.warn('[biometric.store] nạp dữ liệu đã lưu hỏng:', error);
        }
        const target = state ?? storeAtStart;
        target.setHasHydrated(true);

        const { binding } = target;
        if (binding && new Date(binding.expiresAt).getTime() <= Date.now()) {
          target.clearBinding();
        }
      },
    },
  ),
);

/**
 * Chờ `AsyncStorage` nạp xong store này, với TRẦN 3 giây.
 *
 * ⛔ Không có trần này thì một bản JSON hỏng theo cách zustand không tự gọi
 * `onRehydrateStorage` (đã xảy ra thật với dữ liệu bị cắt giữa chừng khi hệ
 * điều hành giết app lúc đang ghi) sẽ khiến `useSessionBootstrap` chờ MÃI MÃI —
 * app kẹt ở màn hình chờ với TẤT CẢ người dùng, không riêng người có dữ liệu hỏng.
 */
export function waitForBiometricHydration(timeoutMs = 3000): Promise<void> {
  if (useBiometricStore.getState().hasHydrated) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };

    const unsubscribe = useBiometricStore.subscribe((state) => {
      if (state.hasHydrated) finish();
    });
    // ⚠️ Khai SAU `finish`/`unsubscribe` nhưng vẫn hợp lệ: closure chỉ ĐỌC
    // `timer` lúc bị GỌI (khi hết giờ hoặc khi hydrate xong), không phải lúc
    // được TẠO — tới lúc đó biến này đã có giá trị.
    const timer = setTimeout(finish, timeoutMs);
  });
}
