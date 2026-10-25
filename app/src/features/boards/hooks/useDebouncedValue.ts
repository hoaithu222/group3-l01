import { useEffect, useState } from 'react';

/**
 * Trễ giá trị 300 ms trước khi dùng làm khoá query (`app.md` §4 "tìm debounce
 * 300 ms"). Bản sao TỐI GIẢN của `channels/hooks/useDebouncedValue.ts` — luật
 * "không import chéo feature".
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
