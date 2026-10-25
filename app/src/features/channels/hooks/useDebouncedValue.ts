import { useEffect, useState } from 'react';

/**
 * Trễ 300ms trước khi dùng để gọi server (`GET /channels/search`, app.md §3:
 * "gọi /channels/search khi ≥ 2 ký tự"). Bản sao TỐI GIẢN của
 * `members/hooks/useDebouncedValue.ts` — luật "không import chéo feature".
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
