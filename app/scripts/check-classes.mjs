/**
 * Soát MỌI class Tailwind trong mã nguồn bằng cách CHẠY THẬT Tailwind.
 *
 * ── Vì sao cần, và vì sao không tin bảng đối chiếu tay ───────────────────────
 * NativeWind bỏ qua class không tồn tại **âm thầm**: không cảnh báo, không lỗi,
 * không log. `p-4` sau khi `theme.spacing` bị ghi đè, `rounded-2xl` sau khi
 * `borderRadius` bị ghi đè, `bg-nav` viết thiếu một tiền tố — tất cả đều biến
 * mất y như nhau, và giao diện chỉ đơn giản là sai chứ không đỏ ở đâu.
 *
 * Đối chiếu tay với `resolveConfig` bắt được phần lớn, nhưng vẫn là suy đoán về
 * việc Tailwind SINH RA cái gì. Ở đây làm ngược lại: gom hết class ứng viên,
 * đưa cho chính Tailwind (với đúng `tailwind.config.js` của dự án) sinh CSS,
 * rồi hỏi từng class xem có selector nào ra đời không. Không suy đoán.
 *
 * Chạy: node check-classes.mjs [thư-mục...]
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));

const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const userConfig = require(path.join(ROOT, 'tailwind.config.js'));

const SCAN_DIRS = process.argv.slice(2).length ? process.argv.slice(2) : ['src', 'app'];

// ── 1. Gom class ứng viên ───────────────────────────────────────────────────

const files = [];
for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      // ⛔ Bỏ file sinh tự động: `icons.*.generated.ts` là một danh sách TÊN
      // ICON (`user-circle`, `ve-may-bay`) — trông y hệt class Tailwind và sẽ
      // sinh ra hàng trăm báo nhầm.
      else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes('.generated.')) files.push(p);
    }
  })(abs);
}

/**
 * Tách chuỗi trông như danh sách class.
 *
 * Chỉ nhận chuỗi mà MỌI mẩu đều giống class (chữ thường, số, `-`, `/`, `[]`,
 * `:`). Nhờ vậy câu văn tiếng Việt trong chú thích hay thông báo lỗi không lọt
 * vào — chúng có dấu, dấu cách kép, chữ hoa.
 */
const CLASSISH = /^-?[a-z0-9]+(?:[-/:.[\]()#%,]|[a-z0-9])*$/;
const STRING_RE = /'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g;

/** class → danh sách "file:dòng" đã gặp. */
const seen = new Map();

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  lines.forEach((text, i) => {
    const trimmed = text.trim();
    // Bỏ dòng chú thích: ví dụ trong chú thích không phải class thật đang chạy.
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

    let m;
    STRING_RE.lastIndex = 0;
    while ((m = STRING_RE.exec(text)) !== null) {
      const content = (m[1] ?? m[2] ?? m[3] ?? '').trim();
      if (!content) continue;

      /**
       * ⛔ Bỏ chuỗi dùng để TRA THUỘC TÍNH: `colors['bg-nav']`, `ICONS['user-edit']`.
       *
       * Đó là tên token/khoá, không phải class. Không bỏ thì `colors['bg-nav']`
       * bị đọc thành class `bg-nav` và báo là class chết — trong khi token
       * `bg-nav` hoàn toàn có thật, chỉ là đang được tra bằng hook chứ không
       * viết trong `className`.
       */
      if (text[m.index - 1] === '[') continue;

      /**
       * ⛔ Bỏ chuỗi đứng làm KHOÁ của object: `'top-left': { … }`.
       *
       * Tên biến thể trong công thức `tv()` (`placement: { 'top-left' … }`) và
       * tên nhóm class trong `cn.ts` (`'rounded-t': …`) trông y hệt class thật.
       * Không bỏ thì mỗi component có biến thể lại sinh vài báo nhầm, và trình
       * soát mất tác dụng vì người ta quen tay bỏ qua nó.
       *
       * Phân biệt với toán tử ba ngôi (`cond ? 'a' : 'b'`) bằng khoảng trắng:
       * khoá object dính liền dấu hai chấm, ba ngôi thì có dấu cách — Prettier
       * bảo đảm điều đó, và Prettier chạy trong `lint-staged`.
       */
      if (text[m.index + m[0].length] === ':') continue;

      const parts = content.split(/\s+/);
      if (!parts.every((p) => CLASSISH.test(p))) continue;
      // Một mẩu đơn không có `-` (vd 'button', 'top') gần như luôn là chuỗi
      // thường chứ không phải class ⇒ bỏ, tránh báo nhầm hàng loạt.
      if (parts.length === 1 && !parts[0].includes('-')) continue;

      for (const cls of parts) {
        if (!seen.has(cls)) seen.set(cls, []);
        const where = `${rel}:${String(i + 1)}`;
        const list = seen.get(cls);
        if (!list.includes(where)) list.push(where);
      }
    }
  });
}

// ── 2. Bắt Tailwind sinh CSS cho đúng bộ class đó ───────────────────────────

const candidates = [...seen.keys()];

const css = await postcss([
  tailwindcss({
    ...userConfig,
    // Nạp thẳng danh sách class thay vì quét file — chắc chắn Tailwind nhìn
    // đúng bộ ta đang hỏi, không phụ thuộc bộ trích xuất của nó.
    content: [{ raw: candidates.join(' '), extension: 'html' }],
  }),
]).process('@tailwind utilities;', { from: undefined });

/** `hover:bg-primary-5/40` → `hover\:bg-primary-5\/40` (cách Tailwind escape). */
const escapeClass = (cls) => cls.replace(/[!"#$%&'()*+,./:;<=>?@[\]^`{|}~]/g, '\\$&');

const generated = new Set();
css.root.walkRules((rule) => {
  for (const sel of rule.selectors) {
    const match = /^\.((?:\\.|[^\s.:>+~[\]])+)/.exec(sel);
    if (match) generated.add(match[1]);
  }
});

// ── 3. Đối chiếu ────────────────────────────────────────────────────────────

/**
 * Class KHÔNG sinh CSS nhưng vẫn hợp lệ — không phải lỗi.
 *
 * `group`/`peer` là móc đánh dấu, `dark` là lớp chuyển theme do NativeWind đặt,
 * còn `flex-1`… thì có sinh. Danh sách này cố tình ngắn: mỗi mục thêm vào là
 * một chỗ trình soát ngừng bảo vệ.
 */
const ALLOWED_WITHOUT_CSS = new Set([
  'group',
  'peer',
  'dark',

  /**
   * Tên HƯỚNG ĐẶT của component (`placement="top-right"`), không phải class.
   *
   * Tailwind không có tiện ích nào ghép hai hướng, nên bốn tên này an toàn để
   * bỏ qua vĩnh viễn: chúng không thể là class gõ sai. Chúng lọt vào vì nằm ở
   * ba chỗ mà bộ trích xuất không phân biệt được với class — kiểu union, giá
   * trị mặc định của tham số, và `defaultVariants` của `tv()`.
   */
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);

/**
 * Không gian tên tiện ích của Tailwind.
 *
 * ⛔ Không có bộ lọc này thì trình soát báo nhầm hàng loạt: tên gói
 * (`react-native`, `tailwind-variants`), tên icon (`sunny-outline`,
 * `ve-may-bay`), tên token tra bằng hook (`success-5` trong một bảng
 * `Record<Type, string>`) — tất cả đều là chuỗi gạch nối trông y hệt class.
 *
 * ⚠️ Đánh đổi: class thuộc một namespace KHÔNG có trong danh sách sẽ không được
 * soát. Danh sách này phủ hết những gì React Native dùng được; thêm tiện ích
 * mới thì thêm vào đây.
 */
const UTILITY_NAMESPACES = new Set([
  'absolute',
  'animate',
  'aspect',
  'basis',
  'bg',
  'block',
  'border',
  'bottom',
  'capitalize',
  'content',
  'decoration',
  'divide',
  'fill',
  'fixed',
  'flex',
  'font',
  'gap',
  'grow',
  'h',
  'hidden',
  'indent',
  'inline',
  'inset',
  'invisible',
  'items',
  'justify',
  'leading',
  'left',
  'line',
  'list',
  'lowercase',
  'm',
  'max',
  'mb',
  'min',
  'ml',
  'mr',
  'mt',
  'mx',
  'my',
  'object',
  'opacity',
  'order',
  'origin',
  'outline',
  'overflow',
  'p',
  'pb',
  'pl',
  'pr',
  'pt',
  'px',
  'py',
  'relative',
  'right',
  'ring',
  'rotate',
  'rounded',
  'scale',
  'select',
  'self',
  'shadow',
  'shrink',
  'size',
  'space',
  'static',
  'sticky',
  'stroke',
  'text',
  'top',
  'tracking',
  'transform',
  'transition',
  'translate',
  'truncate',
  'underline',
  'uppercase',
  'visible',
  'w',
  'whitespace',
  'z',
]);

/** `-mt-xs` → `mt`; `dark:bg-bg-1` → `bg`; `size-xl` → `size`. */
const namespaceOf = (cls) => {
  const bare = cls.slice(cls.lastIndexOf(':') + 1).replace(/^-/, '');
  const cut = bare.indexOf('-');
  return cut === -1 ? bare : bare.slice(0, cut);
};

const dead = [];
for (const cls of candidates) {
  if (ALLOWED_WITHOUT_CSS.has(cls)) continue;
  if (!UTILITY_NAMESPACES.has(namespaceOf(cls))) continue;
  if (generated.has(escapeClass(cls))) continue;
  dead.push(cls);
}

console.log(`Đã quét ${String(files.length)} file trong: ${SCAN_DIRS.join(', ')}`);
console.log(
  `Class ứng viên: ${String(candidates.length)} · Tailwind sinh ra: ${String(generated.size)}`,
);

if (dead.length === 0) {
  console.log('\n✅ Mọi class đều sinh ra CSS — không có class nào bị bỏ qua âm thầm.');
  process.exit(0);
}

console.log(
  `\n❌ ${String(dead.length)} class KHÔNG sinh ra CSS (NativeWind sẽ bỏ qua, không báo gì):\n`,
);
for (const cls of dead.sort()) {
  console.log(`  ${cls}`);
  for (const where of seen.get(cls).slice(0, 4)) console.log(`      ${where}`);
}
process.exit(1);
