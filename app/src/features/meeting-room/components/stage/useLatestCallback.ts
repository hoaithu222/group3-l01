import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Hàm có danh tính CỐ ĐỊNH suốt đời component nhưng luôn gọi bản `fn` MỚI NHẤT.
 *
 * Vì sao: ô người (`ParticipantTile`) được `memo` — nhận một `onLongPress` mới ở mỗi lần cha vẽ là memo vô dụng. Mà cha của sân khấu
 * (`InRoomView`) vẽ lại theo MỖI snapshot media và truyền hàm nội tuyến (`controls.togglePin`, `paging.setPage`…).
 *
 * ⚠️ Ghi `ref` trong `useLayoutEffect` (ngay sau commit, TRƯỚC khi người dùng kịp chạm vào khung hình mới) — ⛔ không ghi lúc render:
 * `react-hooks/refs` cấm, và React Compiler dựa vào ràng buộc đó (cùng mẫu `useSocketEvent`).
 * ⛔ Chỉ dùng cho handler sự kiện (chạm, nhấn giữ, vuốt, effect) — gọi nó TRONG lúc render là đọc bản của lần vẽ trước.
 */
export function useLatestCallback<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
