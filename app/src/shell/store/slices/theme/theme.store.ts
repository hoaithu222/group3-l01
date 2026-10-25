import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createPersistStorage } from '@/core/storage/app-storage';

import type { ThemePreference, ThemeStore } from './types';

/**
 * Store lựa chọn sáng/tối của NGƯỜI DÙNG — không phải theme đang hiển thị.
 *
 * Phân biệt hai khái niệm này là điểm quan trọng nhất của file:
 *
 *   · `preference` (ở đây) — điều người dùng CHỌN: `'system' | 'light' | 'dark'`.
 *   · theme đang hiển thị  — kết quả sau khi hoà `preference` với cài đặt của
 *     hệ điều hành. Tính ở `ThemeProvider`, KHÔNG lưu ở đây.
 *
 * ⛔ Lưu thẳng `'light' | 'dark'` (bỏ `'system'`) là mất khả năng đi theo hệ
 * điều hành: người dùng bật chế độ tối lúc 19h trên máy thì app phải tối theo,
 * mà nếu ta chỉ nhớ "sáng" thì app kẹt sáng cho tới khi họ tự vào Cài đặt đổi.
 * Đây là mặc định mà cả iOS lẫn Android đều kỳ vọng ở một app hiện đại.
 */
const initialState = {
  preference: 'system' as ThemePreference,
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setPreference: (preference) => set({ preference }),

      /**
       * Vòng ba trạng thái: system → light → dark → system.
       *
       * Giữ `'system'` trong vòng lặp có chủ đích — nếu chỉ đảo sáng/tối thì
       * người đã lỡ bấm một lần KHÔNG còn đường quay về "theo hệ thống" ngoài
       * việc gỡ app. Đúng cái bẫy mà `theme.store` bên base web phải sửa bằng
       * `migrate`.
       */
      cyclePreference: () => {
        const order: ThemePreference[] = ['system', 'light', 'dark'];
        const next = order[(order.indexOf(get().preference) + 1) % order.length];
        set({ preference: next ?? 'system' });
      },

      resetPreference: () => set(initialState),
    }),
    {
      name: 'theme-storage',
      storage: createPersistStorage(),
      partialize: (state) => ({ preference: state.preference }),
    },
  ),
);
