/**
 * Luật miền THUẦN của `portfolio` (không I/O) dùng chung DTO Zod, service và test: dạng slug hợp lệ và URL liên kết an toàn.
 */

/** 3–30 ký tự chữ thường/số/`-`, không `--`, không bắt đầu/kết thúc bằng `-` (= `LIMITS.portfolio.slugMin/slugMax`). */
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9]|-(?!-)){1,28}[a-z0-9]$/;

/**
 * Liên kết chỉ nhận `https:` (không `javascript:`/`data:`/`http:`), không kèm tài khoản (`https://tin-cay.com@doc-hai.com`), đủ ngắn. Trả URL chuẩn hoá hoặc `null`
 * (liên kết bị BỎ khỏi trang — CR-33).
 */
export function safeHttpsUrl(raw: string, maxLength = 300): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > maxLength) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || u.username !== "" || u.password !== "" || u.hostname === "") return null;
    return u.href;
  } catch {
    return null;
  }
}
