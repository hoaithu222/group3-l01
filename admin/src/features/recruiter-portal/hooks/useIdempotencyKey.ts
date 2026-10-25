import { useCallback, useState } from 'react';

import { makeClientId } from '../utils/client-id';

/**
 * `Idempotency-Key` cho một Ý ĐỊNH gửi (8–128 ký tự, BE `idempotencyKey("offer-send")`). GIỮ nguyên khi thử lại sau lỗi mạng/5xx (BE trả lại lời mời đã tạo thay vì tạo trùng),
 * nhưng PHẢI ĐỔI (`rotate`) sau một kết luận dứt khoát của BE: BE LƯU mọi phản hồi 4xx (trừ 429) theo khoá 24 giờ, nên gửi lại NỘI DUNG ĐÃ SỬA bằng khoá cũ sẽ nhận lại đúng
 * lỗi cũ (vd `RECR_007` rồi sửa gì cũng vẫn `RECR_007`). Cũng đổi khi thành công để hai lời mời khác nhau không bao giờ dùng chung khoá.
 */
export function useIdempotencyKey(): { key: string; rotate: () => void } {
  const [key, setKey] = useState(makeClientId);
  const rotate = useCallback(() => setKey(makeClientId()), []);
  return { key, rotate };
}
