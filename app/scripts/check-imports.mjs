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
 *
 * ── Phần thứ hai: RANH GIỚI FEATURE ─────────────────────────────────────────
 * `docs/rules/feature-structure.md` cấm import chéo feature ("⛔ Không import chéo
 * feature") và nói ESLint chặn cứng — nhưng `import/no-cycle` chỉ bắt VÒNG, không
 * bắt một chiều `boards → members`. Kết quả là luật chỉ nằm trên giấy: import một
 * chiều vẫn xanh ở mọi cổng, cho tới khi feature kia import ngược lại và vòng hiện
 * ra LÚC CHẠY thành `undefined is not a function` ở một file không liên quan.
 *
 * Nên ở đây: file trong `features/A/**` (không phải test) mà import
 * `@/features/B/**` (B ≠ A) — hay đường tương đối chui sang thư mục feature khác —
 * là đỏ, TRỪ cặp `A → B` khai trong `scripts/feature-boundaries.json` kèm `why`.
 * Ngoại lệ gốc (`chat` là feature NỀN) nằm ở `feature-structure.md`.
 *
 * ⚠️ Import nằm trong CHÚ THÍCH không tính (JSDoc hay nhắc `import … from '@/features/…'`
 * để giải thích vì sao KHÔNG được nhập) — cùng cách bỏ chú thích của phần trên.
 * ⚠️ File test được miễn: chúng dựng dữ liệu giả chứ không phải mã chạy trong app.
 *
 * Chạy: node check-imports.mjs [thư-mục...]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = process.argv.slice(2).length ? process.argv.slice(2) : ['app', 'src', 'tests'];

/**
 * ⚠️ `FEATURE_BOUNDARIES_MANIFEST` tồn tại DUY NHẤT để `tests/scripts/check-gates.test.ts` chĩa trình soát
 * vào một manifest giả (cây nguồn mồi nằm ở thư mục tạm, không dùng chung manifest thật — cùng lý do
 * `FILE_SIZE_MANIFEST`/`CONTRAST_MANIFEST`). ⛔ Đừng dùng biến này trong lúc chạy thường.
 */
const BOUNDARIES_PATH = process.env.FEATURE_BOUNDARIES_MANIFEST
  ? path.resolve(process.env.FEATURE_BOUNDARIES_MANIFEST)
  : path.join(ROOT, 'scripts/feature-boundaries.json');

/** Gói do môi trường cung cấp, không cần khai trong package.json. */
const BUILTIN = new Set([
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  // NativeWind thay hàm dựng JSX; Babel tự chèn import này, không ai viết tay.
  'nativewind/jsx-runtime',
  'nativewind/jsx-dev-runtime',
]);

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
/** file → thư mục gốc quét chứa nó — để suy `features/<tên>/…` từ đường dẫn tương đối, kể cả khi test chĩa vào thư mục tạm. */
const scanBaseOf = new Map();
for (const dir of SCAN_DIRS) {
  // `resolve` chứ không `join`: test truyền được đường dẫn TUYỆT ĐỐI tới thư mục tạm ngoài repo.
  const abs = path.resolve(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) {
        files.push(p);
        scanBaseOf.set(p, abs);
      }
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
const SPEC_RE =
  /(?:^\s*(?:import\s[^'"]*?from\s+|import\s+|\}\s*from\s+)|\bimport\s*\(\s*)['"]([^'"]+)['"]/gm;

const missing = new Map();
for (const file of files) {
  // Bỏ comment TRƯỚC khi quét: JSDoc hay trích ví dụ `import ... from 'x'`,
  // quét cả comment thì báo thiếu một gói mà code không hề dùng.
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  for (const [, spec] of text.matchAll(SPEC_RE)) {
    // Bỏ qua đường tương đối, alias nội bộ, và tài nguyên (css/svg…).
    if (spec.startsWith('.') || spec.startsWith('@/')) continue;
    if (spec.startsWith('node:') || BUILTIN.has(spec)) continue;

    const name = packageNameOf(spec);
    if (declared.has(name)) continue;

    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (!missing.has(name)) missing.set(name, new Set());
    missing.get(name).add(rel);
  }
}

// ── Ranh giới feature ───────────────────────────────────────────────────────

/** `features/<tên>/…` (từ thư mục gốc quét) → `<tên>`; ngoài feature → `null`. */
function featureOf(baseDir, file) {
  const rel = path.relative(baseDir, file).replace(/\\/g, '/');
  const match = /^features\/([^/]+)\//.exec(rel);
  return match ? match[1] : null;
}

/** Test dựng dữ liệu giả — không phải mã chạy trong app, nên miễn (xem đầu file). */
const isTestFile = (file) => /(^|[\\/])tests?[\\/]/.test(file) || /\.test\.tsx?$/.test(file);

/** Mọi đường dẫn nạp module: `import … from`, `export … from`, `import('…')`. Chạy trên mã ĐÃ bỏ chú thích. */
const ANY_SPEC_RE =
  /(?:\b(?:import|export)\b[^;'"]*?\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g;

const boundaries = fs.existsSync(BOUNDARIES_PATH)
  ? JSON.parse(fs.readFileSync(BOUNDARIES_PATH, 'utf8'))
  : { allow: [] };

const boundaryErrors = [];
const allowKey = (from, to) => `${from}->${to}`;
const allowed = new Map();
for (const rule of boundaries.allow ?? []) {
  if (!rule.from || !rule.to) boundaryErrors.push('feature-boundaries.json: mục thiếu "from"/"to"');
  else if (!rule.why)
    boundaryErrors.push(`feature-boundaries.json ${rule.from} → ${rule.to}: thiếu "why"`);
  else allowed.set(allowKey(rule.from, rule.to), rule);
}

/** `A → B` → danh sách chỗ import (chỉ những cặp KHÔNG được khai). */
const crossViolations = new Map();
const usedAllows = new Set();
for (const file of files) {
  if (isTestFile(file)) continue;
  const from = featureOf(scanBaseOf.get(file), file);
  if (!from) continue;

  const text = stripComments(fs.readFileSync(file, 'utf8'));
  for (const match of text.matchAll(ANY_SPEC_RE)) {
    const spec = match[1] ?? '';
    let to = null;
    if (spec.startsWith('@/features/')) to = spec.split('/')[2] ?? null;
    else if (spec.startsWith('.')) {
      // Đường tương đối chui sang thư mục feature khác (`../../boards/x`).
      const target = path.resolve(path.dirname(file), spec);
      to = featureOf(scanBaseOf.get(file), path.join(target, '_'));
    }
    if (!to || to === from) continue;

    const key = allowKey(from, to);
    if (allowed.has(key)) {
      usedAllows.add(key);
      continue;
    }
    const line = text.slice(0, match.index).split('\n').length;
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (!crossViolations.has(key)) crossViolations.set(key, []);
    crossViolations.get(key).push(`${rel}:${String(line)}  ${spec}`);
  }
}

const staleBoundaries = [...allowed.keys()].filter((key) => !usedAllows.has(key));

// ── Báo ─────────────────────────────────────────────────────────────────────

let failed = false;

if (missing.size === 0) {
  console.log(`✅ ${files.length} file — mọi import đều có trong package.json`);
} else {
  failed = true;
  console.error(`⛔ ${missing.size} gói được import nhưng KHÔNG khai trong package.json:\n`);
  for (const [name, where] of missing) {
    console.error(`  ${name}`);
    for (const f of where) console.error(`      ${f}`);
  }
  console.error('\nCài gói đó, hoặc bỏ import. ⛔ ĐỪNG vá bằng `declare module` —');
  console.error('làm vậy chỉ dập tín hiệu của tsc, chương trình vẫn nổ lúc chạy.');
}

if (boundaryErrors.length > 0) {
  failed = true;
  console.error('\n⛔ feature-boundaries.json sai:');
  for (const message of boundaryErrors) console.error(`  ${message}`);
}

if (crossViolations.size === 0) {
  console.log('✅ Không có import chéo feature ngoài các cặp đã khai (feature-boundaries.json)');
} else {
  failed = true;
  const total = [...crossViolations.values()].reduce((sum, list) => sum + list.length, 0);
  console.error(
    `\n⛔ ${String(total)} import CHÉO FEATURE, ${String(crossViolations.size)} cặp:\n`,
  );
  for (const [key, where] of crossViolations) {
    console.error(`  ${key.replace('->', ' → ')}`);
    for (const line of where.slice(0, 5)) console.error(`      ${line}`);
    if (where.length > 5) console.error(`      … và ${String(where.length - 5)} chỗ nữa`);
  }
  console.error(
    '\nCần dùng chung thì đưa lên `@/shared` · `@/core` · `@/shell`. Cần dữ liệu của feature khác thì gọi THẲNG\n' +
      'endpoint bằng service của mình (mẫu `channelsService.searchWorkspaceMembers`). Import chéo là đường ngắn\n' +
      'nhất tới import VÒNG — mà vòng trên RN hiện ra lúc chạy dưới dạng `undefined is not a function` ở file khác.\n' +
      'Ngoại lệ THẬT (feature nền như `chat`): khai cặp vào `scripts/feature-boundaries.json` kèm `why`.',
  );
}

if (staleBoundaries.length > 0) {
  console.log('\n⚠️ Cặp THỪA trong feature-boundaries.json (không còn import nào — xoá mục):');
  for (const key of staleBoundaries) console.log(`  ${key.replace('->', ' → ')}`);
}

process.exit(failed ? 1 : 0);
