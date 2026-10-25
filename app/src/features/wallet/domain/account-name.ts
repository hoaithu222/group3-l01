/**
 * Tên chủ tài khoản theo quy ước NAPAS: IN HOA, KHÔNG DẤU, chỉ chữ/số/khoảng
 * trắng. BE chuẩn hoá lại (`accountName` ≤ 50 ký tự) nên đây là chuẩn hoá để
 * NGƯỜI DÙNG thấy đúng cái sẽ được lưu ngay lúc gõ, không phải hàng rào bảo mật.
 *
 * ⚠️ KHÔNG `trim()` ở đây: hàm chạy MỖI lần gõ, cắt khoảng trắng cuối thì không
 * gõ nổi dấu cách giữa hai từ ("NGUYEN" → "NGUYEN VAN"). Cắt hai đầu là việc của
 * schema lúc gửi (`.trim()` — `form-validation.md`).
 * ⚠️ `Đ`/`đ` là ký tự độc lập, NFD không tách được — thay tay như `normalizeSearch`.
 */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

export function toAccountName(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/ {2,}/g, ' ');
}
