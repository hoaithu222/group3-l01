/**
 * Chuẩn hoá email cho MỌI lần tra cứu/ghi: cắt khoảng trắng + chữ thường.
 *
 * `User.email` là unique nhưng Mongo so khớp PHÂN BIỆT hoa/thường — không
 * chuẩn hoá thì `Foo@x.com` và `foo@x.com` là hai tài khoản khác nhau (đăng ký
 * trùng, đăng nhập sai chỉ vì bàn phím tự viết hoa chữ đầu, né được giới hạn
 * theo email). Chuẩn hoá ở DTO (Zod) VÀ ở repository để không phụ thuộc nơi gọi.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
