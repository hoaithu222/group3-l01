import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

/**
 * Chữ ký sinh trắc học — tính TẠI CHỖ trên máy, không gửi bí mật thô lên mạng.
 *
 * ── Vì sao không gửi thẳng `secret` như bản nháp đầu của app.md ──────────────
 * BE đã đổi hợp đồng: `POST /auth/biometric/login` giờ nhận
 * `{ credentialId, deviceId, nonce, hmac }`, không còn `secret`. Bí mật đọc ra
 * từ kho khoá (`biometric-vault.ts`) CHỈ dùng để tính `hmac` ở đây rồi bị bỏ —
 * không network layer nào, không log nào được thấy giá trị `secret` gốc.
 *
 * ── Công thức, ⛔ ĐÚNG TỪNG BIT với phía BE ───────────────────────────────────
 *   hmac = HMAC-SHA256(key = SHA256(secret), message = nonce)
 *
 * Điểm dễ sai nhất: khoá của HMAC là DIGEST DẠNG BYTE thô (32 byte) của
 * `sha256(secret)`, KHÔNG PHẢI chuỗi hex của digest đó được mã hoá lại thành
 * UTF-8. `@noble/hashes` — `sha256(...)` trả thẳng `Uint8Array` (đúng thứ cần),
 * nên KHÔNG được gọi thêm `bytesToHex()` rồi `utf8ToBytes()` lên kết quả đó —
 * làm vậy là đổi độ dài khoá từ 32 byte thành 64 byte (chuỗi hex) và toàn bộ
 * HMAC ra sai, mà lỗi này KHÔNG ném exception nào — chỉ đăng nhập sinh trắc
 * luôn báo sai vân tay/Face ID một cách bí ẩn.
 *
 * Đối chiếu phía BE (Node, không chạy ở đây, chỉ để soi lại công thức):
 *   crypto.createHmac('sha256', crypto.createHash('sha256').update(secret, 'utf8').digest())
 *         .update(nonce, 'utf8')
 *         .digest('hex')
 *
 * `crypto.createHash(...).digest()` (không truyền `'hex'`) cũng trả về BUFFER
 * NHỊ PHÂN — khớp đúng với `sha256(...)` trả `Uint8Array` bên dưới, không phải
 * hex. Xem `tests/biometric-signing.test.ts`: nó dựng lại chính công thức Node
 * này một cách ĐỘC LẬP rồi so khớp, để không cần thiết bị thật cũng biết chắc
 * hai bên tính ra cùng một giá trị.
 *
 * @param secret Bí mật thiết bị đọc từ kho khoá (`readSecret`) — CHỈ dùng cục bộ
 *   ở đây, ⛔ không log, không lưu thêm chỗ nào khác, không đưa vào bất kỳ object
 *   nào gửi qua `apiClient`.
 * @param nonce  Mã dùng một lần từ `GET /auth/nonce`, lấy NGAY trước lượt gọi
 *   `POST /auth/biometric/login`.
 * @returns Chuỗi hex 64 ký tự (viết thường) — đúng khuôn dạng `hmac` mà BE đòi.
 */
export function computeBiometricHmac(secret: string, nonce: string): string {
  const keyBytes = sha256(utf8ToBytes(secret));
  const macBytes = hmac(sha256, keyBytes, utf8ToBytes(nonce));
  return bytesToHex(macBytes);
}
