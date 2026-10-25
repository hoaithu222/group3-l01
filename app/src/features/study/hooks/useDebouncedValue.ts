import { useEffect, useState } from 'react';

/**
 * Trễ giá trị dùng để GỌI SERVER (`q` của `GET /study-sets`, app.md p4-01 §3: "tìm IME-safe"). `SearchInput` vẫn
 * uncontrolled — hook chỉ trễ giá trị nhận qua `onChangeText`, không đụng ô nhập nên không ghi đè bộ gõ đang ghép dấu.
 * Bản sao tối giản (luật "không import chéo feature").
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
