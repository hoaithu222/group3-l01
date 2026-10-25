import { useEffect, useRef } from 'react';

import { loadStyle, saveStyle } from '../store/whiteboard-prefs';
import { useWhiteboardUiStore } from '../store/whiteboard-ui.store';

/**
 * Vòng đời store UI của màn vẽ: sạch khi VÀO và khi RỜI màn (công cụ/vùng chọn/tấm soạn chữ của bảng trước không rò sang bảng sau — app.md §5 "reset khi
 * rời màn"), nạp kiểu vẽ gần nhất của NGƯỜI DÙNG từ đĩa và ghi lại khi đổi. ⚠️ Chỉ ghi SAU khi đã nạp xong: ghi ngay lúc mở là ghi đè kiểu đã lưu bằng
 * kiểu mặc định trước khi đọc kịp.
 */
export function useWhiteboardUiLifecycle(userId: string | undefined): void {
  const style = useWhiteboardUiStore((state) => state.style);
  const loaded = useRef(false);

  useEffect(() => {
    const { reset, setStyle } = useWhiteboardUiStore.getState();
    reset();
    loaded.current = false;
    let cancelled = false;
    void loadStyle(userId).then((saved) => {
      if (cancelled) return;
      setStyle(saved);
      loaded.current = true;
    });
    return () => {
      cancelled = true;
      useWhiteboardUiStore.getState().reset();
    };
  }, [userId]);

  useEffect(() => {
    if (loaded.current) saveStyle(userId, style);
  }, [style, userId]);
}
