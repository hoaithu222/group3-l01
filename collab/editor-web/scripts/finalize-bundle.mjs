/**
 * Chốt bundle sau `vite build`: kiểm không có tài nguyên/API mạng ngoài, ghim CSP theo hash script, kiểm kích thước. Ghi đè `dist/editor.html`.
 * Thoát mã ≠ 0 nếu vi phạm — `npm run build` thất bại thay vì phát hành bundle sai.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { analyzeBundle, MAX_BUNDLE_BYTES, pinScriptCsp } from "./lib/bundle-checks.mjs";

const file = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/editor.html");
const fail = (message) => {
  process.stderr.write(`finalize-bundle: ${message}\n`);
  process.exit(1);
};

let html = readFileSync(file, "utf8");
const report = analyzeBundle(html);
if (report.scripts.length !== 1) fail(`cần đúng 1 <script> nội tuyến, tìm thấy ${report.scripts.length}`);
if (!report.hasCsp) fail("thiếu <meta http-equiv=Content-Security-Policy>");
if (report.problems.length > 0) fail(`tài nguyên ngoài:\n  ${report.problems.join("\n  ")}`);
if (report.forbidden.length > 0) fail(`dùng API bị cấm: ${report.forbidden.join(", ")}`);

const pinned = pinScriptCsp(html);
html = pinned.html;
writeFileSync(file, html);

const raw = Buffer.byteLength(html, "utf8");
const gzip = gzipSync(html).length;
if (raw > MAX_BUNDLE_BYTES) fail(`quá lớn: ${raw} B > ${MAX_BUNDLE_BYTES} B`);
process.stdout.write(`editor.html: ${(raw / 1024).toFixed(1)} KiB (gzip ${(gzip / 1024).toFixed(1)} KiB), CSP script ${pinned.hashes.join(" ")}\n`);
