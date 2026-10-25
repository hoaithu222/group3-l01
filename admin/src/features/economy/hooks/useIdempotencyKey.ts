import { useCallback, useState } from 'react';

/** Khoá idempotency cho MỘT ý định ghi — `crypto.randomUUID` chỉ có ở ngữ cảnh an toàn (HTTPS/localhost), nên có dự phòng cho `http://192.168.x.x`. */
function makeKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/**
 * `Idempotency-Key` (8–128 ký tự; BE `idempotencyKey("coins-adjust", { required: true })`) cho một lần điều chỉnh ví. GIỮ khi thử lại sau lỗi mạng/5xx
 * (BE trả lại kết quả đã có, không cộng hai lần); `rotate()` sau một kết luận 4xx của BE — BE lưu phản hồi 4xx theo khoá 24 giờ nên gửi lại nội dung đã sửa
 * bằng khoá cũ chỉ nhận lại lỗi cũ (xem `shouldRotateIdempotencyKey`). Nơi dùng dựng modal MỖI LẦN MỞ (mount mới) nên khoá luôn mới theo từng ý định.
 */
export function useIdempotencyKey(): { key: string; rotate: () => void } {
  const [key, setKey] = useState(makeKey);
  const rotate = useCallback(() => setKey(makeKey()), []);
  return { key, rotate };
}
