import { useCallback, useRef } from 'react';

/**
 * Chống GỬI ĐÚP một biểu mẫu.
 *
 * ── Vì sao `isPending` của React Query không đủ ─────────────────────────────
 * `Button loading` khoá được nút, nhưng bàn phím thì không: `onSubmitEditing` ("Xong"/"Gửi") của
 * ô cuối gọi thẳng `submit`. Bấm "Xong" hai lần liền — hoặc một lần trong lúc nút đang quay —
 * bắn HAI lượt `mutate`. `isPending` còn cập nhật BẤT ĐỒNG BỘ (sau một lần vẽ), nên lượt thứ hai
 * đọc vẫn thấy `false`. Hậu quả tuỳ form: hai lượt đăng ký (lượt sau ăn 409 "email đã tồn tại" và
 * HIỆN LỖI dù tài khoản đã tạo xong), hai lượt đăng nhập xoay refresh token, hai email đặt lại
 * mật khẩu. Cờ `ref` đổi ĐỒNG BỘ nên chặn được cả hai.
 *
 * `start` nhận hàm `release` — gọi khi lượt kết thúc (`onSettled` của mutation).
 */
export function useBusyGuard(): (start: (release: () => void) => void) => void {
  const busy = useRef(false);

  return useCallback((start: (release: () => void) => void) => {
    if (busy.current) return;
    busy.current = true;
    start(() => {
      busy.current = false;
    });
  }, []);
}
