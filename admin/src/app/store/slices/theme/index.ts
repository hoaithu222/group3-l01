import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ThemeStoreType, ThemeMode } from './types';

/**
 * Màu của hệ thống = `dark` (DUY NHẤT, từ 2026-08-22).
 *
 * Toàn bộ chrome (header · dock · nền DataV của `BackgroundLayout`) được cân
 * trên nền tối. Lối đổi sang `light` đã gỡ khỏi UserMenu — xem
 * `shared/widgets/header/user/user-menu.constants.ts`.
 *
 * Store vẫn giữ nguyên API (`setTheme`/`toggleTheme`) để ThemeProvider và các
 * chỗ đang import không vỡ, nhưng KHÔNG còn UI nào gọi `toggleTheme`. Vì
 * theme được persist, ai đang kẹt ở `light` sẽ không có nút quay lại → dùng
 * `version` + `migrate` bên dưới để ép về `dark` một lần khi rehydrate.
 *
 * `resetTheme()` cũng quay về đây, nên chỉ cần sửa một chỗ này.
 */
const initialState = {
  theme: 'dark' as ThemeMode,
};

export const useThemeStore = create<ThemeStoreType>()(
  persist(
    (set, get) => ({
      ...initialState,

      setTheme: (theme: ThemeMode) => {
        set({ theme });
      },

      toggleTheme: () => {
        const currentTheme = get().theme;
        set({ theme: currentTheme === 'light' ? 'dark' : 'light' });
      },

      resetTheme: () => {
        set(initialState);
      },
    }),
    {
      name: 'theme-storage', // Tên key lưu trên localStorage
      storage: createJSONStorage(() => localStorage),
      // v1: gỡ nút đổi theme → ép mọi state cũ (kể cả 'light' đã persist) về
      // 'dark', nếu không user đang ở light sẽ kẹt vĩnh viễn vì không còn nút.
      version: 1,
      migrate: () => ({ ...initialState }),
      // Giống whitelist của redux-persist, chỉ định chính xác field nào được lưu
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
