import { useState } from 'react';

import { getHttpStatus } from '../utils/error-details';
import { newIdempotencyKey } from '../utils/idempotency-key';

/**
 * `Idempotency-Key` cho MỘT LƯỢT thao tác trong tấm sao chép (bảng/thẻ). Tấm chỉ được dựng khi mở và bị gỡ khi xong (`X ? <Sheet /> : null`)
 * nên khoá sinh lúc dựng là khoá của lượt đó — lần sao chép sau dựng tấm mới, khoá mới, không bị BE phát lại bản của lượt trước.
 *
 * Trong CÙNG một lượt (tấm còn mở, người dùng bấm lại "Nhân bản" sau lỗi):
 *  · ✅ Lỗi MẠNG (không có phản hồi) → GIỮ khoá: BE có thể đã tạo xong, khoá cũ phát lại đúng bản đã tạo thay vì nhân đôi.
 *  · ⛔ Lỗi CÓ phản hồi (403, 404, `TASK_009`, `TASK_010`, `VAL_001`) → khoá MỚI: BE lưu cả phản hồi 4xx theo khoá suốt 24 giờ
 *    (`idempotencyKey` middleware) — giữ khoá cũ là mọi lần "Thử lại" nhận lại chính câu lỗi cũ dù người dùng đã đổi cột/tên.
 */
export function useAttemptKey(prefix: string): { key: string; settle: (error: unknown) => void } {
  const [key, setKey] = useState(() => newIdempotencyKey(prefix));

  /** Gọi ở `onError` của lượt gửi. */
  const settle = (error: unknown) => {
    if (getHttpStatus(error) !== undefined) setKey(newIdempotencyKey(prefix));
  };

  return { key, settle };
}
