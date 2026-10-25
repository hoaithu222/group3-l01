import type { ThemeStoreType } from './types';

// Lấy ra giá trị theme hiện tại
export const selectThemeMode = (state: ThemeStoreType) => state.theme;

// Lấy ra bộ actions (không bao giờ gây re-render vì functions không đổi)
export const selectThemeActions = (state: ThemeStoreType) => ({
  setTheme: state.setTheme,
  toggleTheme: state.toggleTheme,
  resetTheme: state.resetTheme,
});
