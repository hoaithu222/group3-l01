import { useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { visibleRowRange } from '../utils/gantt-layout';

/** Chiều cao giả định trước khi có `onLayout` — đủ phủ một màn tablet để khung đầu KHÔNG rỗng. */
const FALLBACK_VIEWPORT = 720;

/**
 * Ảo hoá hàng của Gantt theo vùng nhìn thấy (app.md §2 "hàng ảo hoá theo vùng nhìn thấy"): chỉ vẽ các hàng trong
 * `[first, last]` (+ overscan). Lưu vị trí cuộn ĐÃ LÀM TRÒN theo hàng: `setState` cùng giá trị thì React bỏ qua, nên cuộn
 * mượt không vẽ lại từng pixel — chỉ vẽ lại khi cuộn qua ranh giới một hàng.
 */
export function useVisibleRows(rowCount: number, rowHeight: number, overscan: number) {
  const [scrollRow, setScrollRow] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const range = visibleRowRange({
    overscan,
    rowCount,
    rowHeight,
    scrollY: scrollRow * rowHeight,
    viewportHeight: viewportHeight || FALLBACK_VIEWPORT,
  });

  return {
    range,
    onLayout: (event: LayoutChangeEvent) => setViewportHeight(event.nativeEvent.layout.height),
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      setScrollRow(Math.floor(event.nativeEvent.contentOffset.y / rowHeight)),
  };
}
