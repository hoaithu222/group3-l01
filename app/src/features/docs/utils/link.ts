import { isSafeLinkUrl } from '../webview/parse-editor-message';

/**
 * Chuẩn hoá chuỗi người dùng nhập thành liên kết an toàn: `example.com` → `https://example.com`, `a@b.vn` → `mailto:a@b.vn`; có sẵn
 * scheme thì giữ. Không an toàn (`javascript:`, `data:`, quá dài…) → `null`. Cùng luật với `normalizeLinkHref` của editor
 * (`collab/editor-web/src/bridge-validate.ts`) — trang vẫn kiểm lại lần nữa, đây là để báo lỗi NGAY trong tấm thay vì im lặng bỏ lệnh.
 */
export function normalizeLinkHref(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  let candidate = `https://${text}`;
  if (hasScheme) candidate = text;
  else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) candidate = `mailto:${text}`;
  return isSafeLinkUrl(candidate) ? candidate : null;
}
