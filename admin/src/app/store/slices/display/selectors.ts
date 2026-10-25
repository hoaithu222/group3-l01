import type { DisplayStoreType } from './types';

export const selectDisplayMode = (state: DisplayStoreType) => state.mode;

/** `true` khi đang ở chế độ TV — selector dùng nhiều nhất, tách riêng cho gọn. */
export const selectIsTv = (state: DisplayStoreType) => state.mode === 'tv';

/**
 * Hệ số scale ĐANG CÓ HIỆU LỰC — luôn `1` ở chế độ standard dù store còn nhớ
 * lựa chọn TV cũ. Mọi nơi cần nhân cỡ chữ (chart metrics…) PHẢI dùng selector
 * này, KHÔNG đọc thẳng `state.uiScale`.
 */
export const selectEffectiveUiScale = (state: DisplayStoreType) =>
  state.mode === 'tv' ? state.uiScale : 1;
