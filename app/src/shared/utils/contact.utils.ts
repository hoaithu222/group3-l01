import { normalizePhone } from './phone.utils';

/**
 * Phân loại ô nhập "email hoặc số điện thoại" — ĐỒNG BỘ với `classifyContactQuery` của BE
 * (`be/src/core/utils/contact-query.ts`): email ĐẦY ĐỦ, SĐT hợp lệ, hay chưa đủ (`INCOMPLETE`).
 *
 * Vì sao client phải tự phân loại: BE chỉ tra KHỚP CHÍNH XÁC (không tiền tố — tránh dò danh bạ), nên gõ dở dang
 * chỉ tốn một lượt gọi bị 400 và ăn vào hạn mức tra cứu theo NGƯỜI DÙNG. Chỉ gọi khi đã đủ.
 */
export type ContactInput =
  | { kind: 'EMAIL'; value: string }
  /** `value` là E.164 (`+84912345678`) — đúng thứ BE tra khớp. */
  | { kind: 'PHONE'; value: string }
  | { kind: 'INCOMPLETE'; value: string };

/** Hình dạng tối thiểu của email (không thay `email` của schema — chỉ để phân loại ô nhập). */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** RFC 5321. */
const EMAIL_MAX = 254;

export function classifyContactInput(raw: string): ContactInput {
  const text = raw.trim();
  if (text.includes('@')) {
    const email = text.toLowerCase();
    return email.length <= EMAIL_MAX && EMAIL_SHAPE.test(email)
      ? { kind: 'EMAIL', value: email }
      : { kind: 'INCOMPLETE', value: text };
  }
  const phone = normalizePhone(text);
  return phone ? { kind: 'PHONE', value: phone } : { kind: 'INCOMPLETE', value: text };
}
