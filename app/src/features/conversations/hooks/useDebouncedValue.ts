import { useEffect, useState } from 'react';

/**
 * Trễ 300ms trước khi gọi server `q` (app.md §3 "debounce 300 ms"). Bản sao
 * TỐI GIẢN của `members/hooks/useDebouncedValue.ts` — luật "không import chéo
 * feature" (`feature-structure.md`).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
