import { useEffect, useState } from 'react';

/**
 * Trễ 300ms trước khi cập nhật giá trị dùng để GỌI SERVER (`q` của
 * `GET /workspaces/:id/members`, app.md p1-02 §3: "gửi `q` debounce 300 ms,
 * IME-safe"). `SearchInput` vẫn uncontrolled (`defaultValue` + `onChangeText`)
 * — hook này chỉ trễ giá trị đã nhận qua `onChangeText`, không đụng gì tới ô
 * nhập, nên không có rủi ro ghi đè bộ gõ Telex đang ghép dấu.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
