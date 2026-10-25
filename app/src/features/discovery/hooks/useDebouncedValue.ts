import { useEffect, useState } from 'react';

/**
 * Trễ `delayMs` trước khi dùng giá trị để gọi server (ô tìm người gửi). Bản sao TỐI GIẢN của
 * `chat/hooks/useDebouncedValue.ts` — luật "không import chéo feature" (`feature-structure.md`).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
