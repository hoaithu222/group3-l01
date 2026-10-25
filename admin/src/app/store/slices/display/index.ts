import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  DEFAULT_TV_UI_SCALE,
  DISPLAY_INITIAL_STATE,
  DISPLAY_STORAGE_KEY,
  DISPLAY_STORAGE_VERSION,
  UI_SCALE_VALUES,
} from './constants';
import type { DisplayMode, DisplayStoreType, UiScale } from './types';

/**
 * Store chế độ hiển thị (standard / TV).
 *
 * Bật TV → cỡ chữ ×`uiScale` (1.1 / 1.2 / 1.3), tắt → ×1.
 * Bố cục GIỮ NGUYÊN ở cả hai chế độ — xem `types.ts`.
 */
export const useDisplayStore = create<DisplayStoreType>()(
  persist(
    (set, get) => ({
      ...DISPLAY_INITIAL_STATE,

      setMode: (mode: DisplayMode) => {
        set({ mode });
      },

      setUiScale: (uiScale: UiScale) => {
        set({ uiScale });
      },

      toggleMode: () => {
        set({ mode: get().mode === 'tv' ? 'standard' : 'tv' });
      },

      resetDisplay: () => {
        set(DISPLAY_INITIAL_STATE);
      },
    }),
    {
      name: DISPLAY_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: DISPLAY_STORAGE_VERSION,
      /**
       * Bản 1 lưu `uiScale` trong dải cũ (1.5 / 1.8 / 2.2) và một field
       * `overscan` nay đã bỏ. Máy nào từng bật TV ở bản đó sẽ khôi phục ra chữ
       * to gấp đôi — phải nắn về giá trị hợp lệ thay vì tin dữ liệu cũ.
       *
       * Giữ lại `mode` (lựa chọn bật/tắt của user vẫn hợp lệ) và giữ `uiScale`
       * nếu nó tình cờ nằm trong dải mới; ngoài dải thì về mặc định.
       */
      migrate: (persisted) => {
        const prev = (persisted ?? {}) as Partial<{ mode: DisplayMode; uiScale: number }>;
        const keptScale = UI_SCALE_VALUES.find((v) => v === prev.uiScale);
        return {
          mode: prev.mode === 'tv' ? 'tv' : 'standard',
          uiScale: keptScale ?? DEFAULT_TV_UI_SCALE,
        };
      },
      partialize: (state) => ({ mode: state.mode, uiScale: state.uiScale }),
    },
  ),
);
