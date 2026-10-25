/**
 * Đọc/kiểm email cho ô nhập nhiều địa chỉ (`EmailChipsInput`, app.md p3-04 §2).
 *
 * Kiểm ở client CHỈ để chặn gõ nhầm rõ ràng (thiếu `@`, thiếu tên miền) — quyền
 * quyết cuối cùng là `z.string().trim().email().max(254)` của BE (be.md §3), nên
 * mẫu ở đây cố ý rộng hơn zod một chút: sai thì BE trả lỗi, còn chặn nhầm một
 * địa chỉ hợp lệ ở client là không có đường thoát cho người dùng.
 */

/** RFC 5321: địa chỉ tối đa 254 ký tự — cùng trần `.max(254)` của BE. */
export const EMAIL_MAX_LENGTH = 254;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
/** Dấu phẩy, chấm phẩy, khoảng trắng, xuống dòng — người dùng dán từ Excel/email thường kèm cả bốn. */
const SEPARATOR_PATTERN = /[\s,;]+/;

export function isValidEmail(value: string): boolean {
  return value.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(value);
}

/** Có ít nhất một dấu tách — báo hiệu người dùng vừa gõ xong một địa chỉ (hoặc dán nhiều địa chỉ). */
export function hasEmailSeparator(text: string): boolean {
  return SEPARATOR_PATTERN.test(text);
}

/** Tách chuỗi thành các mục đã trim, bỏ mục rỗng. Không đổi hoa/thường, không lọc sai định dạng. */
export function splitEmailTokens(text: string): string[] {
  return text
    .split(SEPARATOR_PATTERN)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export interface MergeEmailsResult {
  emails: string[];
  /** Có mục bị bỏ vì vượt `max` — nơi gọi báo "Tối đa N email". */
  overflow: boolean;
}

/**
 * Gộp các mục trong `text` vào danh sách hiện có. Khử trùng KHÔNG phân biệt
 * hoa/thường (BE cũng chuẩn hoá `normalizedEmail` như vậy, `A@x.com` = `a@x.com`)
 * và giữ cách viết của lần nhập ĐẦU. Mục sai định dạng vẫn được GIỮ (hiện thành
 * chip lỗi) để người dùng thấy và sửa, không lặng lẽ biến mất.
 */
export function mergeEmails(current: readonly string[], text: string, max: number): MergeEmailsResult {
  const seen = new Set(current.map((email) => email.toLowerCase()));
  const emails = [...current];
  let overflow = false;

  for (const token of splitEmailTokens(text)) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    if (emails.length >= max) {
      overflow = true;
      continue;
    }
    seen.add(key);
    emails.push(token);
  }
  return { emails, overflow };
}

/** Còn ít nhất một địa chỉ sai định dạng — màn khoá nút Gửi (địa chỉ sai hiện thành chip lỗi, không tự biến mất). */
export function hasInvalidEmail(emails: readonly string[]): boolean {
  return emails.some((email) => !isValidEmail(email));
}
