import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";

export function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/**
 * CSP của trang công khai (README §2): không script, ảnh chỉ cùng nguồn, CSS inline, không `<base>`/form, không nhúng iframe. Đặt ĐÈ lên CSP mặc định của helmet
 * (`app.ts`) — trang này phục vụ trên tên miền chính nên đây là hàng rào chống XSS/phishing cuối cùng nếu bộ lọc nội dung bỏ sót.
 */
export const PUBLIC_PAGE_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
/** Xem trước: ảnh nhúng data URI thay vì `'self'` (WebView chỉ gửi header Authorization cho yêu cầu ĐẦU, không cho ảnh con). */
export const PREVIEW_PAGE_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Trần nginx cache 5 phút (`proxy_cache_valid 200 301 5m`) — cũng là trần hiển thị sau Unpublish (CR-05). */
export const PUBLIC_MAX_AGE_SECONDS = 300;
export const NOT_FOUND_MAX_AGE_SECONDS = 60;

export interface HeaderOptions {
  csp: string;
  /** `noindex` (mặc định, cả trang chưa bật SEO) hay cho phép lập chỉ mục. */
  indexable: boolean;
  cacheControl: string;
}

/** Header an toàn dùng chung cho mọi phản hồi HTML của portfolio (công khai, 404, xem trước). */
export function setPageHeaders(res: Response, o: HeaderOptions): void {
  res.setHeader("Content-Security-Policy", o.csp);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", o.indexable ? "index, follow" : "noindex, nofollow");
  res.setHeader("Cache-Control", o.cacheControl);
}

/** Trang 404 trung tính, dùng chung cho "không tồn tại"/"đã gỡ"/"chưa công khai" — không phân biệt để không lộ gì. */
export const NOT_FOUND_HTML = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Không tìm thấy trang</title>
<style>body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#ffffff;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:16px}main{max-width:420px}h1{font-size:1.5rem;margin:0 0 .5em}p{color:#475569;margin:0}</style></head>
<body><main><h1>Không tìm thấy trang</h1><p>Trang portfolio này không tồn tại hoặc hiện không được công khai.</p></main></body></html>
`;

export function sendNotFoundPage(res: Response): void {
  setPageHeaders(res, { csp: PUBLIC_PAGE_CSP, indexable: false, cacheControl: `public, max-age=${NOT_FOUND_MAX_AGE_SECONDS}` });
  res.status(404).type("text/html; charset=utf-8").send(NOT_FOUND_HTML);
}
