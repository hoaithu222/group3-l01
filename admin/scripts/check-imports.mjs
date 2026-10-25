/**
 * Đối chiếu mọi import gói ngoài với `package.json`.
 *
 * ── Vì sao cần ───────────────────────────────────────────────────────────────
 * `tsc` KHÔNG bắt được gói thiếu nếu ai đó viết `declare module 'x'` ở file
 * `.d.ts`, và bundler cũng không đỏ nếu chưa file nào import tới chỗ đó. Đúng
 * ca đã xảy ra: `format.utils.ts` import `numeral` — gói chưa từng được cài,
 * có một dòng `declare module 'numeral'` chép từ dự án cũ đỡ cho `tsc`, và
 * build vẫn xanh vì không ai gọi `formatCurrency()`. Gọi một phát là nổ.
 *
 * Script này đi thẳng vào nguồn sự thật: tên gói xuất hiện trong `import` phải
 * có mặt trong `dependencies` / `devDependencies`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['src', 'tests'];

/** Gói do môi trường cung cấp, không cần khai trong package.json. */
const BUILTIN = new Set(['react/jsx-runtime', 'node:fs', 'node:path', 'node:url']);

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);

/** `@scope/name/sub/path` → `@scope/name`; `name/sub` → `name`. */
function packageNameOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * Xoá comment khối và comment dòng trước khi quét.
 *
 * `[^:]` trước `//` để không cắt nhầm phần sau `https://` trong chuỗi URL.
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const files = [];
for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
  })(abs);
}

/**
 * Chỉ bắt câu lệnh import THẬT.
 *
 * Neo vào ĐẦU DÒNG: `import …` mở đầu dòng, hoặc `from '…'` sau dấu `}` khép
 * lại một import nhiều dòng. Không neo thì một chuỗi hay biểu thức chính quy
 * có chứa đoạn `from '…'` cũng bị đọc thành import.
 *
 * Đã xảy ra thật: `tests/shared/kit2-props-types.test.ts` quét barrel bằng
 * biểu thức chính quy chứa đúng đoạn văn bản đó, và trình kiểm báo thiếu hai
 * "gói" tên `\.\` và `[^` — hai thứ không tồn tại.
 *
 * `import(…)` thì KHÔNG neo — nạp lười gần như luôn nằm giữa dòng
 * (`const X = () => import('y')`), neo vào là mất dấu nó.
 */
const SPEC_RE = /(?:^\s*(?:import\s[^'"]*?from\s+|import\s+|\}\s*from\s+)|\bimport\s*\(\s*)['"]([^'"]+)['"]/gm;

const missing = new Map();
for (const file of files) {
  // Bỏ comment TRƯỚC khi quét: JSDoc hay trích ví dụ `import ... from 'x'`,
  // quét cả comment thì báo thiếu một gói mà code không hề dùng.
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  for (const [, spec] of text.matchAll(SPEC_RE)) {
    // Bỏ qua đường tương đối, alias nội bộ, và tài nguyên (css/svg…).
    if (spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('@tests/')) continue;
    if (spec.startsWith('node:') || BUILTIN.has(spec)) continue;

    const name = packageNameOf(spec);
    if (declared.has(name)) continue;

    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (!missing.has(name)) missing.set(name, new Set());
    missing.get(name).add(rel);
  }
}

if (missing.size === 0) {
  console.log(`✅ ${files.length} file — mọi import đều có trong package.json`);
  process.exit(0);
}

console.error(`⛔ ${missing.size} gói được import nhưng KHÔNG khai trong package.json:\n`);
for (const [name, where] of missing) {
  console.error(`  ${name}`);
  for (const f of where) console.error(`      ${f}`);
}
console.error('\nCài gói đó, hoặc bỏ import. ⛔ ĐỪNG vá bằng `declare module` —');
console.error('làm vậy chỉ dập tín hiệu của tsc, chương trình vẫn nổ lúc chạy.');
process.exit(1);
