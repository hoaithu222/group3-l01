/**
 * generate-icons.mjs — biến thư mục `assets/icons/**.svg` thành module TypeScript.
 *
 * NGUỒN DUY NHẤT: chính các file `.svg` xuất từ Figma (bộ BIDV SmartBanking).
 * Thêm/bớt icon = thêm/bớt file `.svg` rồi chạy `npm run generate:icons`.
 *
 * ── Vì sao phải SINH RA CODE, không import thẳng `.svg` ──────────────────────
 * Metro KHÔNG hiểu `.svg`. Cách phổ biến là cài `react-native-svg-transformer`,
 * nhưng nó thêm một transformer vào Metro cho MỌI file — đổi một mắt xích ở tầng
 * bundler để đọc được một loại tài nguyên. Ở đây icon là dữ liệu tĩnh, sinh sẵn
 * ra `.ts` thì Metro không phải biết gì thêm, và cả bộ icon được kiểm kiểu:
 * gõ sai tên icon là `tsc` đỏ ngay, chứ không phải ô trống trên máy thật.
 *
 * ── Ba nhóm, ba cách dùng ────────────────────────────────────────────────────
 *  · `system/`  — icon giao diện, MỘT hoặc HAI tông, nhuộm được theo token màu.
 *                 Có biến thể: linear (mặc định) · solid · twotone · bulk.
 *  · `feature/` — icon dịch vụ (vé máy bay, bảo hiểm…), hai tông cố định.
 *  · `bank/`    — logo ngân hàng. ⛔ KHÔNG nhuộm: đổi màu logo thương hiệu của
 *                 ngân hàng khác là sai nhận diện của họ.
 *
 * ── Hai chỗ thay màu, và vì sao ──────────────────────────────────────────────
 * Bộ icon của thiết kế vẽ nét chính bằng `#00453C` (MaGreen 500) và nét nhấn
 * bằng `#B18535` (MaBrown 500). Script đổi:
 *   `#00453C` → `currentColor`  → nhận màu từ prop `color` của `<Icon>`
 *   `#B18535` → `%A%`           → thay lúc chạy bằng prop `accentColor`
 * Nhờ vậy một file SVG phục vụ được mọi ngữ cảnh màu (nút xanh, nền tối, cảnh
 * báo đỏ) mà không phải xuất lại từ Figma.
 *
 * ⛔ Đừng sửa file `*.generated.ts` — lần chạy sau ghi đè sạch.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = path.join(ROOT, 'assets/icons');
const OUT_DIR = path.join(ROOT, 'src/shared/ui/icon');

const BANNER = 'Sinh tự động từ assets/icons/**. ⛔ ĐỪNG SỬA TAY.';

/**
 * Nét chính của bộ icon → `currentColor`.
 *
 * Hai mã, không phải một: nét vẽ dùng `#00453C` (MaGreen 500), còn mảng nền mờ
 * của biến thể `bulk` dùng `#003E36` (`Opacity/Primary` của thiết kế) kèm
 * `fill-opacity`. Bỏ sót mã thứ hai thì icon `bulk` giữ nguyên mảng XANH khi
 * đặt trên nút đỏ hay nền tối — 82/375 file dính, và không có lỗi nào báo.
 */
const MAIN_HEX = /#00453c|#003e36/gi;
/** Nét nhấn → chỗ trống, `<Icon>` thay bằng `accentColor` lúc chạy. */
const ACCENT_HEX = /#b18535/gi;

const GROUPS = [
  {
    dir: 'system',
    prefix: '',
    tintable: true,
    file: 'icons.system.generated.ts',
    konst: 'SYSTEM_ICONS',
  },
  {
    dir: 'feature',
    prefix: 'fn/',
    tintable: true,
    file: 'icons.feature.generated.ts',
    konst: 'FEATURE_ICONS',
  },
  {
    dir: 'bank',
    prefix: 'bank/',
    tintable: false,
    file: 'icons.bank.generated.ts',
    konst: 'BANK_ICONS',
  },
];

const VARIANTS = ['linear', 'solid', 'twotone', 'bulk'];

/**
 * Chuẩn hoá SVG thô của Figma về chuỗi dùng được cho `SvgXml`.
 *
 * ⛔ Bỏ `width`/`height` trên thẻ gốc là BẮT BUỘC, không phải dọn dẹp cho gọn:
 * còn hai thuộc tính đó thì icon luôn vẽ ở 24dp bất kể prop `size` truyền vào
 * bao nhiêu — `react-native-svg` ưu tiên thuộc tính có sẵn trong XML.
 */
function normalize(svg, { tintable }) {
  let out = svg
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

  const rootMatch = /<svg\b([^>]*)>/i.exec(out);
  if (!rootMatch) return { error: 'không tìm thấy thẻ <svg>' };

  const viewBox = /viewBox="([^"]+)"/i.exec(rootMatch[1]);
  if (!viewBox) return { error: 'thẻ <svg> thiếu viewBox' };

  const attrs = rootMatch[1]
    .replace(/\s(width|height)="[^"]*"/gi, '')
    .replace(/\s(xmlns:xlink)="[^"]*"/gi, '')
    .trim();

  out = out.replace(/<svg\b[^>]*>/i, `<svg ${attrs}>`);

  if (tintable) {
    out = out.replace(MAIN_HEX, 'currentColor').replace(ACCENT_HEX, '%A%');
  }

  if (!/<(path|circle|rect|ellipse|line|polygon|polyline|g|image|use|defs)\b/i.test(out)) {
    return { error: 'không có hình nào để vẽ' };
  }

  return { svg: out, viewBox: viewBox[1], hasAccent: out.includes('%A%') };
}

/** `arrow-right.solid.svg` → `{ name: 'arrow-right', variant: 'solid' }`. */
function parseFileName(file) {
  const base = file.replace(/\.svg$/i, '');
  const dot = base.lastIndexOf('.');
  if (dot === -1) return { name: base, variant: 'linear' };
  const tail = base.slice(dot + 1);
  return VARIANTS.includes(tail)
    ? { name: base.slice(0, dot), variant: tail }
    : { name: base, variant: 'linear' };
}

const problems = [];
const summary = [];
const allNames = [];

for (const group of GROUPS) {
  const dir = path.join(ICON_DIR, group.dir);

  let files = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.svg')).sort();
  } catch {
    problems.push(`thiếu thư mục assets/icons/${group.dir}`);
  }

  /** @type {Map<string, Record<string, string>>} */
  const icons = new Map();
  let accentCount = 0;

  for (const file of files) {
    const { name, variant } = parseFileName(file);
    const raw = await fs.readFile(path.join(dir, file), 'utf8');
    const result = normalize(raw, group);

    if (result.error) {
      problems.push(`${group.dir}/${file}: ${result.error}`);
      continue;
    }
    if (result.hasAccent) accentCount += 1;

    if (!icons.has(name)) icons.set(name, {});
    icons.get(name)[variant] = result.svg;
  }

  const names = [...icons.keys()].sort();
  for (const name of names) allNames.push(group.prefix + name);

  const entries = names
    .map((name) => {
      const variants = icons.get(name);
      const inner = Object.keys(variants)
        .sort()
        .map((v) => `    ${v}: ${JSON.stringify(variants[v])},`)
        .join('\n');
      return `  ${JSON.stringify(name)}: {\n${inner}\n  },`;
    })
    .join('\n');

  const out = `/* ${BANNER} */
/* eslint-disable */
// prettier-ignore
export const ${group.konst}: Record<string, Partial<Record<'linear' | 'solid' | 'twotone' | 'bulk', string>>> = {
${entries}
};
`;

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, group.file), out);
  summary.push({ group: group.dir, icons: names.length, files: files.length, accent: accentCount });
}

// ── Danh sách TÊN — nguồn cho kiểu `IconName` ────────────────────────────────
const namesOut = `/** ${BANNER} */
/* eslint-disable */
// prettier-ignore

/**
 * Tên icon dùng được cho \`<Icon name="…" />\`.
 *
 * Ba nhóm phân biệt bằng TIỀN TỐ, để tên không đụng nhau và nhìn là biết loại:
 *   \`home\`            — icon giao diện (nhóm system)
 *   \`fn/ve-may-bay\`   — icon dịch vụ
 *   \`bank/bidv\`       — logo ngân hàng
 */
export type IconName =
${allNames.map((n) => `  | ${JSON.stringify(n)}`).join('\n')};

export const ICON_NAMES = [
${allNames.map((n) => `  ${JSON.stringify(n)},`).join('\n')}
] as const satisfies readonly IconName[];
`;

await fs.writeFile(path.join(OUT_DIR, 'icon-names.generated.ts'), namesOut);

if (problems.length) {
  console.error('❌ Có file SVG hỏng:');
  problems.forEach((p) => console.error('   ·', p));
  process.exit(1);
}

for (const s of summary) {
  console.log(
    `✅ ${s.group}: ${s.icons} icon / ${s.files} file svg (${s.accent} file có nét nhấn)`,
  );
}
console.log(`✅ src/shared/ui/icon/icon-names.generated.ts — ${allNames.length} tên`);
