/**
 * `Idempotency-Key` cho các lượt GHI TIỀN (tạo khoản chi, tạo settlement).
 *
 * ⛔ KHÔNG dùng `Crypto.randomUUID()` (`expo-crypto`) — trong Jest nó lặng lẽ trả
 * `undefined`; ở đây chỉ cần KHÔNG TRÙNG trong một phiên. Độ dài luôn nằm trong
 * 8–128 ký tự mà BE yêu cầu (`idempotency.ts`: `z.string().min(8).max(128)`).
 *
 * ⚠️ `signature` (chữ ký của body sắp gửi) được băm vào khoá vì BE lưu CẢ phản
 * hồi 4xx theo khoá trong 24 giờ: gửi lại CÙNG khoá sau khi sửa body sẽ nhận lại
 * đúng câu lỗi cũ, dù dữ liệu mới đã đúng. Xem `useIdempotencyKey`.
 */
let counter = 0;

/** djb2 → base36, đủ để phân biệt hai body khác nhau; KHÔNG dùng cho bảo mật. */
function shortHash(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

export function newIdempotencyKey(prefix: string, signature = ''): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${shortHash(signature)}-${Date.now().toString(36)}-${counter}-${random}`;
}
