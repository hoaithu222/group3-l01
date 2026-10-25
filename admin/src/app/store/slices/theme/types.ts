export type ThemeMode = 'light' | 'dark';

export interface ThemeState {
  theme: ThemeMode;
}

export interface ThemeActions {
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  resetTheme: () => void;
}

// Gộp chung lại cho Store
export type ThemeStoreType = ThemeState & ThemeActions;
