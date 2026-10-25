import { useEffect, useState } from 'react';

/**
 * Trễ 300ms trước khi cập nhật giá trị dùng để GỌI SERVER (`q` của ô tìm người
 * nhận quyền chủ nhóm). `SearchInput` vẫn uncontrolled (`onChangeText`) — hook
 * này chỉ trễ giá trị đã nhận, không đụng gì tới ô nhập nên không ghi đè bộ gõ
 * Telex đang ghép dấu. Bản sao TỐI GIẢN của `members/hooks/useDebouncedValue.ts`
 * — luật "không import chéo feature" (`feature-structure.md`).
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
