/**
 * Lựa chọn sáng/tối của người dùng.
 *
 * `'system'` là mặc định và PHẢI có mặt — xem chú thích ở `theme.store.ts`.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

/** Theme thực sự đang vẽ ra màn hình. Chỉ có hai giá trị. */
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeState {
  preference: ThemePreference;
}

export interface ThemeActions {
  setPreference: (preference: ThemePreference) => void;
  /** Vòng: system → light → dark → system. */
  cyclePreference: () => void;
  resetPreference: () => void;
}

export type ThemeStore = ThemeState & ThemeActions;
