/**
 * @file useEventCallback.ts
 * @description Trả về 1 callback có IDENTITY ổn định (không đổi giữa các render)
 * nhưng luôn gọi bản mới nhất của `fn`. Dùng để truyền handler xuống component/
 * cột được memo mà KHÔNG làm chúng rebuild mỗi render — tránh re-render toàn bảng
 * khi gõ liên tục. (Tương đương `useEffectEvent` sắp có của React.)
 */

import { useCallback, useLayoutEffect, useRef } from 'react';

// Ràng buộc theo KIỂU HÀM (không phải theo tuple tham số) → TS suy luận đúng kiểu
// tham số cho callback nhiều đối số + có giá trị mặc định (tránh param bị `unknown`).
export function useEventCallback<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  // Ghi ref sau commit (không ghi lúc render — vi phạm react-hooks/refs).
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback(
    (...args: Parameters<T>): ReturnType<T> => ref.current(...args) as ReturnType<T>,
    [],
  ) as T;
}
