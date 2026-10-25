import { useCallback, useMemo, useState } from 'react';

import { newIdempotencyKey } from '../utils/idempotency-key';

/**
 * Khoá chống gửi trùng cho MỘT lượt ghi tiền.
 *
 * Spec p6-04 §4 nói "sinh 1 lần khi mở form". Giữ đúng ý đó cho ca CHÍNH — bấm
 * "Lưu" hai lần, mạng chậm, thử lại sau 5xx: cùng body ⇒ cùng khoá ⇒ BE chỉ tạo
 * MỘT bản ghi. Nhưng KHÔNG giữ nguyên tuyệt đối, vì BE (`idempotency.ts`) lưu cả
 * phản hồi 4xx 24 giờ theo khoá: nếu form báo `WALLET_002` (tổng chia lệch), người
 * dùng sửa số rồi bấm lại với CÙNG khoá thì nhận nguyên câu lỗi cũ dù body đã
 * đúng — nút Lưu "hỏng" mà không ai hiểu vì sao. Nên khoá đổi khi:
 *  · `signature` (chữ ký body) đổi — người dùng sửa dữ liệu;
 *  · `rotate()` được gọi — sau một lỗi 4xx dứt khoát (BE đã chốt câu trả lời đó).
 * Lỗi mạng/5xx thì KHÔNG đổi khoá (BE không lưu 5xx nên thử lại là an toàn).
 */
export function useIdempotencyKey(prefix: string, signature: string) {
  const [attempt, setAttempt] = useState(0);
  const key = useMemo(
    () => newIdempotencyKey(prefix, `${signature}#${attempt}`),
    [prefix, signature, attempt],
  );
  const rotate = useCallback(() => setAttempt((value) => value + 1), []);
  return { key, rotate };
}
