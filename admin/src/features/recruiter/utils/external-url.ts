/**
 * Liên kết ngoài từ dữ liệu người dùng nhập (website doanh nghiệp): CHỈ nhận `http(s)`.
 * BE đã chặn `javascript:` ở đầu vào (`websiteSchema`) nhưng client không tin dữ liệu cũ/đường khác — `href` mà là `javascript:` thì chạy mã khi bấm.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
