import type { ThemeStore } from './types';

export const selectThemePreference = (state: ThemeStore) => state.preference;
export const selectSetThemePreference = (state: ThemeStore) => state.setPreference;
export const selectCycleThemePreference = (state: ThemeStore) => state.cyclePreference;
