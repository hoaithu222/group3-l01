import crypto from 'node:crypto';

import { computeBiometricHmac } from '../biometric-signing';

/**
 * Test QUAN TRỌNG NHẤT của cả việc p0-13: chứng minh `computeBiometricHmac`
 * tương thích DÂY với BE mà KHÔNG cần thiết bị thật hay server sống.
 *
 * ── Cách chứng minh ───────────────────────────────────────────────────────────
 * Dựng lại ĐỘC LẬP công thức phía BE ngay trong chính test này, bằng module
 * `crypto` built-in của Node (không đụng tới `@noble/hashes` — nếu dùng lại
 * chính thư viện đang test thì một lỗi CHUNG trong cách hiểu công thức sẽ lọt
 * qua cả hai bên và test vẫn xanh):
 *
 *   crypto.createHmac('sha256', crypto.createHash('sha256').update(secret, 'utf8').digest())
 *         .update(nonce, 'utf8')
 *         .digest('hex')
 *
 * Rồi so khớp với `computeBiometricHmac(secret, nonce)`. Hai đường tính hoàn
 * toàn khác thư viện, cùng ra một giá trị ⇒ công thức đúng.
 */
function referenceHmac(secret: string, nonce: string): string {
  const key = crypto.createHash('sha256').update(secret, 'utf8').digest();
  return crypto.createHmac('sha256', key).update(nonce, 'utf8').digest('hex');
}

describe('computeBiometricHmac — đối chiếu với crypto của Node', () => {
  it.each([
    ['bi-mat-thiet-bi-32-byte-base64url', 'nonce-mot-lan-abc123'],
    ['a', 'b'],
    ['S3cr3t!@#$%^&*()_+ tiếng Việt có dấu', 'nonce-2'],
    // Bí mật rất dài — chốt rằng SHA-256 làm khoá luôn ra ĐÚNG 32 byte bất kể
    // độ dài đầu vào, chứ không phải cắt/đệm bí mật gốc rồi dùng trực tiếp.
    ['x'.repeat(4096), 'nonce-dai'],
  ])('secret=%p nonce=%p ⇒ khớp Node crypto', (secret, nonce) => {
    expect(computeBiometricHmac(secret, nonce)).toBe(referenceHmac(secret, nonce));
  });

  it('trả về chuỗi hex 64 ký tự viết THƯỜNG — đúng khuôn dạng BE đòi', () => {
    const result = computeBiometricHmac('secret', 'nonce');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * Nonce rỗng KHÔNG BAO GIỜ xảy ra thật (BE luôn cấp một chuỗi khác rỗng),
   * nhưng hàm vẫn phải chạy được — một luồng gọi hàm với dữ liệu bất thường
   * không được phép LÀM SẬP app, dù server sẽ từ chối request đó bằng AUTH_018.
   */
  it('nonce rỗng — không ném lỗi, vẫn khớp công thức tham chiếu', () => {
    expect(computeBiometricHmac('secret', '')).toBe(referenceHmac('secret', ''));
  });

  it('secret rỗng — không ném lỗi (chỉ là một khoá HMAC hợp lệ dù vô nghĩa)', () => {
    expect(computeBiometricHmac('', 'nonce')).toBe(referenceHmac('', 'nonce'));
  });

  it('cùng secret khác nonce ⇒ ra hmac KHÁC NHAU (không phải hằng số)', () => {
    const a = computeBiometricHmac('secret-co-dinh', 'nonce-1');
    const b = computeBiometricHmac('secret-co-dinh', 'nonce-2');
    expect(a).not.toBe(b);
  });

  it('cùng nonce khác secret ⇒ ra hmac KHÁC NHAU', () => {
    const a = computeBiometricHmac('secret-a', 'nonce-co-dinh');
    const b = computeBiometricHmac('secret-b', 'nonce-co-dinh');
    expect(a).not.toBe(b);
  });

  it('KHÔNG được lấy hex của SHA-256(secret) làm khoá (bẫy hay gặp nhất)', () => {
    // Nếu ai đó "sửa" hàm để làm HMAC trên chuỗi HEX của digest thay vì trên
    // BYTE thô của digest, kết quả sẽ lệch khỏi công thức tham chiếu — test
    // này chốt rằng bẫy đó không lọt qua được.
    const secret = 'secret-kiem-tra-bay-hex';
    const nonce = 'nonce-kiem-tra-bay-hex';
    // ⛔ Không dùng `Buffer` — cấm trên toàn bộ `src/` (React Native không có
    // global đó). `crypto.createHmac` nhận `key` là chuỗi thường được, Node tự
    // hiểu theo UTF-8 — đủ để dựng khoá SAI kiểu "hex-làm-chuỗi" cần so sánh.
    const wrongKeyHex = crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
    const wrong = crypto.createHmac('sha256', wrongKeyHex).update(nonce, 'utf8').digest('hex');

    expect(computeBiometricHmac(secret, nonce)).not.toBe(wrong);
    expect(computeBiometricHmac(secret, nonce)).toBe(referenceHmac(secret, nonce));
  });
});
