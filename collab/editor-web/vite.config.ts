import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * CSP của trang editor (meta, chỉ chèn lúc BUILD; dev server giữ nguyên để HMR chạy).
 *  - `script-src 'unsafe-inline'` chỉ là chỗ giữ: `scripts/finalize-bundle.mjs` thay bằng hash sha256 của script nội tuyến sau khi build
 *    (chặn `onerror=`/`<script>` chèn thêm nếu có lỗ hổng XSS trong nội dung tài liệu).
 *  - `connect-src ws: wss:` — URL collab do BE trả lúc chạy (`init.url`) nên không ghim được host; chỉ WebSocket, không `fetch`/XHR.
 *  - `img-src https: http: data: blob:` — ảnh chỉ nạp từ URL ký do app gửi qua bridge (node ảnh không có thuộc tính `src` trong tài liệu).
 */
export const EDITOR_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src https: http: data: blob:",
  "connect-src ws: wss:",
  "font-src data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "object-src 'none'",
].join("; ");

function injectCsp(): Plugin {
  return {
    name: "editor-inject-csp",
    apply: "build",
    transformIndexHtml: (html) => html.replace("<!--CSP-->", `<meta http-equiv="Content-Security-Policy" content="${EDITOR_CSP}" />`),
  };
}

export default defineConfig({
  plugins: [injectCsp(), viteSingleFile({ removeViteModuleLoader: true })],
  build: {
    // WebView Android (Chromium ≥ 80) / iOS 14+: hạ cú pháp về ES2020, không polyfill.
    target: "es2020",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    chunkSizeWarningLimit: 2000,
    rolldownOptions: { input: "editor.html" },
  },
});
