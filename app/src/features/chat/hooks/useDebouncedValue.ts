import { useEffect, useState } from 'react';

/**
 * Trễ 300ms trước khi dùng để gọi server (`ForwardSheet` tìm đích chuyển tiếp,
 * app.md §3). Bản sao TỐI GIẢN của `channels/hooks/useDebouncedValue.ts` —
 * luật "không import chéo feature" (`feature-structure.md`).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
