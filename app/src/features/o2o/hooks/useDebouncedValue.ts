import { useEffect, useState } from 'react';

/**
 * Trễ giá trị trước khi dùng làm khoá query — bấm Stepper số bản liên tục không bắn mỗi lần bấm một lượt báo giá. Bản sao TỐI GIẢN của
 * `channels/hooks/useDebouncedValue.ts` (luật "không import chéo feature", `feature-structure.md`).
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
