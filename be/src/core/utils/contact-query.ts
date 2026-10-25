import { normalizeEmail } from "../auth/normalize-email";
import { normalizePhone } from "./phone";

/**
 * Phân loại ô tìm người: email đầy đủ, số điện thoại hợp lệ, hay chữ thường (tên).
 *
 * Email/SĐT chỉ tra KHỚP CHÍNH XÁC (không tiền tố/chứa) — cho phép quét theo từng ký tự là biến ô tìm kiếm thành công cụ
 * dò danh bạ. Chữ thường (`TEXT`) chỉ được dùng để lọc TRONG tập người đã chung nhóm với người tìm (xem `conversations.people`).
 */
export type ContactQuery =
  | { kind: "EMAIL"; email: string }
  | { kind: "PHONE"; phone: string }
  | { kind: "TEXT"; text: string };

/** Hình dạng tối thiểu của email (không thay `emailSchema` của DTO — chỉ để phân loại ô tìm kiếm). */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** RFC 5321. */
const EMAIL_MAX = 254;

export function classifyContactQuery(raw: string): ContactQuery {
  const text = raw.trim();
  if (text.includes("@")) {
    const email = normalizeEmail(text);
    if (email.length <= EMAIL_MAX && EMAIL_SHAPE.test(email)) return { kind: "EMAIL", email };
    return { kind: "TEXT", text };
  }
  const phone = normalizePhone(text);
  if (phone) return { kind: "PHONE", phone };
  return { kind: "TEXT", text };
}

/** "lan@gmail.com" → "l***@gmail.com" — gợi ý CHE (không lộ địa chỉ đầy đủ) cho màn xem trước/kết quả tra cứu/bảng admin. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
