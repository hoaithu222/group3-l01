/**
 * Kiểm tra/chốt file HTML tự chứa của editor (dùng bởi `finalize-bundle.mjs`, có unit test).
 * Hàm thuần: nhận chuỗi HTML, trả kết quả — không đọc/ghi file.
 */
import { createHash } from "node:crypto";

/** Trần kích thước (byte) của `dist/editor.html`: plan p6-01 đặt ≤ 1,5 MB (đo cả thô lẫn gzip, lấy 1.5 × 1000² cho chặt). */
export const MAX_BUNDLE_BYTES = 1_500_000;

/** API mạng/thực thi động mà bundle KHÔNG được dùng (chỉ WebSocket tới collab qua provider; nội dung ảnh do app cấp URL). */
export const FORBIDDEN_APIS = ["fetch(", "XMLHttpRequest", "sendBeacon", "EventSource", "importScripts", "eval(", "new Function("];

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/** Các thẻ `<script>` (thuộc tính + nội dung). */
export function scriptsOf(html) {
  return [...html.matchAll(SCRIPT_RE)].map((m) => ({ attrs: m[1] ?? "", text: m[2] ?? "" }));
}

/**
 * Phân tích: thẻ tài nguyên ngoài (script src, link, img/iframe/source src, `url(http…)`, `@import`), API bị cấm, và CSP có sẵn hay chưa.
 * Chuỗi URL nằm trong mã thư viện (đường dẫn tài liệu trong thông báo cảnh báo…) KHÔNG phải yêu cầu mạng nên không tính.
 */
export function analyzeBundle(html) {
  const scripts = scriptsOf(html);
  const problems = [];
  for (const s of scripts) if (/\bsrc\s*=/.test(s.attrs)) problems.push(`script ngoài: <script${s.attrs}>`);
  const withoutScripts = html.replace(SCRIPT_RE, "");
  for (const m of withoutScripts.matchAll(/<link\b[^>]*>/gi)) problems.push(`thẻ link: ${m[0].slice(0, 80)}`);
  for (const m of withoutScripts.matchAll(/<(?:img|iframe|source|video|audio|embed|object)\b[^>]*\b(?:src|data)\s*=\s*["']?(?:https?:)?\/\/[^>]*>/gi)) problems.push(`tài nguyên ngoài: ${m[0].slice(0, 80)}`);
  for (const m of html.matchAll(/url\(\s*["']?(https?:)?\/\/[^)]*\)/gi)) problems.push(`css url ngoài: ${m[0].slice(0, 80)}`);
  for (const m of html.matchAll(/@import\s+(?:url\()?["']?(?:https?:)?\/\//gi)) problems.push(`@import ngoài: ${m[0]}`);
  const scriptText = scripts.map((s) => s.text).join("\n");
  const forbidden = FORBIDDEN_APIS.filter((api) => scriptText.includes(api));
  const hasCsp = /<meta[^>]+http-equiv=["']Content-Security-Policy["']/i.test(html);
  return { scripts, problems, forbidden, hasCsp };
}

/** sha256 base64 của nội dung script (CSP hash). */
export function cspHash(text) {
  return `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
}

/**
 * Thay `script-src 'unsafe-inline'` trong CSP bằng hash các script nội tuyến ⇒ chỉ đúng những script này chạy được (chặn `onerror=`/script chèn thêm).
 * Trình phân tích HTML chuẩn hoá CRLF → LF trước khi băm nên script có `\r` sẽ lệch hash: từ chối thay vì phát hành CSP sai.
 */
export function pinScriptCsp(html) {
  const scripts = scriptsOf(html).filter((s) => !/\bsrc\s*=/.test(s.attrs));
  if (scripts.length === 0) throw new Error("không có script nội tuyến để ghim CSP");
  if (scripts.some((s) => s.text.includes("\r"))) throw new Error("script nội tuyến chứa CR — hash CSP sẽ lệch");
  const hashes = scripts.map((s) => cspHash(s.text));
  if (!html.includes("script-src 'unsafe-inline'")) throw new Error("CSP không có `script-src 'unsafe-inline'` để thay");
  return { html: html.replace("script-src 'unsafe-inline'", `script-src ${hashes.join(" ")}`), hashes };
}
