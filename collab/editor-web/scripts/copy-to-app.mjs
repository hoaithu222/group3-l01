/**
 * Chép `dist/editor.html` sang app: `app/assets/collab/editor.html` (app nạp file này vào WebView). Chạy sau `npm run build`.
 *   npm run copy:app                     # ghi đè bản trong app
 *   npm run copy:app -- --dry-run        # chỉ in việc sẽ làm
 *   npm run copy:app -- --dest <đường-dẫn>
 * Từ chối chép file chưa qua `finalize-bundle` (CSP chưa ghim hash) hoặc vượt trần kích thước.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_BUNDLE_BYTES } from "./lib/bundle-checks.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const destIndex = args.indexOf("--dest");
const src = resolve(here, "../dist/editor.html");
const dest = destIndex >= 0 && args[destIndex + 1] ? resolve(args[destIndex + 1]) : resolve(here, "../../../app/assets/collab/editor.html");

const fail = (message) => {
  process.stderr.write(`copy-to-app: ${message}\n`);
  process.exit(1);
};

if (!existsSync(src)) fail("chưa có dist/editor.html — chạy `npm run build` trước");
const size = statSync(src).size;
if (size > MAX_BUNDLE_BYTES) fail(`dist/editor.html quá lớn (${size} B > ${MAX_BUNDLE_BYTES} B)`);
if (!/script-src 'sha256-/.test(readFileSync(src, "utf8"))) fail("dist/editor.html chưa qua finalize-bundle (CSP chưa ghim hash) — chạy `npm run build`");
if (destIndex < 0 && !existsSync(resolve(here, "../../../app/package.json"))) fail("không tìm thấy thư mục app/ của repo");

process.stdout.write(`${dryRun ? "[dry-run] " : ""}${src} -> ${dest} (${(size / 1024).toFixed(1)} KiB)\n`);
if (!dryRun) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
