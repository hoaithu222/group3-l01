/**
 * generate-colors.mjs — sinh bảng màu cho NativeWind + TypeScript.
 *
 * NGUỒN DUY NHẤT: `src/styles/colors/colors.json` (chép nguyên từ base web
 * `base-projects`, nên web và mobile dùng CHUNG một bộ token — đổi màu ở một
 * nơi là hai nền tảng cùng đổi).
 *
 * ── Vì sao KHÔNG sinh ra file `.css` như bên web ──────────────────────────────
 * Web (Tailwind 4) khai token bằng `@theme inline` trong CSS. NativeWind 4 chạy
 * trên Tailwind **3.4**, không có `@theme`, và `@import` một file CSS phụ vào
 * `global.css` phải nhờ `postcss-import` — thêm một mắt xích có thể hỏng âm
 * thầm giữa Metro và Tailwind CLI.
 *
 * Nên ở đây token đi thẳng vào `tailwind.config.js` dưới dạng MODULE JS:
 *   - `tailwind.config.js` dựng `theme.colors` từ nó,
 *   - và một plugin `addBase` bơm biến CSS cho `:root` / `.dark`.
 * Không có CSS trung gian ⇒ không có mắt xích nào để hỏng.
 *
 * ── Hai loại token, xử lý KHÁC nhau ──────────────────────────────────────────
 *  1. **Đặc** (`#RRGGBB`) → biến chứa BA KÊNH `R G B`, map sang
 *     `rgb(var(--x) / <alpha-value>)`. Nhờ vậy `bg-primary-5/40` vẫn chạy, và
 *     đổi sáng/tối chỉ là đổi giá trị biến.
 *  2. **Có sẵn độ trong** (`#RRGGBBAA` hoặc `rgba(...)`) → biến chứa BỐN phần
 *     `R G B / A`, map sang `rgb(var(--x))` — KHÔNG có `<alpha-value>`.
 *
 *     ⚠️ Hệ quả: nhóm 2 KHÔNG dùng được modifier độ trong (`bg-overlay/50` sẽ
 *     không có tác dụng). Đúng ý đồ: token đã mang sẵn độ trong của nó, chồng
 *     thêm một lớp nữa là mất kiểm soát giá trị cuối. Cần độ trong khác thì
 *     dùng token ĐẶC rồi tự thêm modifier (`bg-primary-5/20`).
 *
 * Cả hai nhóm đều đi qua biến CSS nên đều đổi theo `:root` / `.dark`.
 * Dạng `rgb(var(--x))` — biến cấp toàn bộ danh sách kênh cho hàm màu — là đúng
 * khuôn mà NativeWind/shadcn dùng cho theme (`hsl(var(--primary))`).
 *
 * ⛔ Đừng sửa file `*.generated.*` — lần chạy sau ghi đè sạch.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const INPUT = path.join(ROOT, 'src/styles/colors/colors.json');
const JS_OUT = path.join(ROOT, 'src/styles/colors/colors.generated.js');
const TS_OUT = path.join(ROOT, 'src/shared/theme/colors.generated.ts');

const BANNER = 'Sinh tự động từ colors.json. ⛔ ĐỪNG SỬA TAY.';

const SOLID_HEX = /^#[0-9a-fA-F]{6}$/;
const ALPHA_HEX = /^#[0-9a-fA-F]{8}$/;
const RGBA_FN = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/;

/** Cắt số 0 thừa: `0.30` → `0.3`, `1.000` → `1`. */
const trimNum = (n) => String(Math.round(n * 1000) / 1000);

/**
 * Chuẩn hoá mọi dạng màu về danh sách kênh của cú pháp rgb() hiện đại:
 *   `#22C55E`             → { channels: '34 197 94',           hasAlpha: false }
 *   `#FFFFFF1A`           → { channels: '255 255 255 / 0.102', hasAlpha: true  }
 *   `rgba(34,197,94,0.1)` → { channels: '34 197 94 / 0.1',     hasAlpha: true  }
 * Trả `null` khi không nhận dạng được — nơi gọi biến nó thành lỗi có tên token.
 */
const toChannels = (value) => {
  if (SOLID_HEX.test(value)) {
    const h = value.slice(1);
    const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return { channels: rgb.join(' '), hasAlpha: false };
  }
  if (ALPHA_HEX.test(value)) {
    const h = value.slice(1);
    const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    const a = parseInt(h.slice(6, 8), 16) / 255;
    return { channels: `${rgb.join(' ')} / ${trimNum(a)}`, hasAlpha: true };
  }
  const m = RGBA_FN.exec(value);
  if (m) {
    const rgb = [m[1], m[2], m[3]].map(Number);
    const a = m[4] === undefined ? 1 : Number(m[4]);
    if (rgb.some((n) => n > 255)) return null;
    return a === 1
      ? { channels: rgb.join(' '), hasAlpha: false }
      : { channels: `${rgb.join(' ')} / ${trimNum(a)}`, hasAlpha: true };
  }
  return null;
};

/** Mọi dạng màu → `#RRGGBB` cho prop nhận màu thô của React Native. */
const toHex = (value) => {
  if (SOLID_HEX.test(value)) return value.toUpperCase();
  if (ALPHA_HEX.test(value)) return value.slice(0, 7).toUpperCase();
  const m = RGBA_FN.exec(value);
  if (!m) return value;
  return `#${[m[1], m[2], m[3]]
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
};

/** Alpha thực của token (1 khi đục hoàn toàn) — cho `colors.generated.ts`. */
const alphaOf = (value) => {
  if (ALPHA_HEX.test(value))
    return Math.round((parseInt(value.slice(7, 9), 16) / 255) * 1000) / 1000;
  const m = RGBA_FN.exec(value);
  if (m && m[4] !== undefined) return Number(m[4]);
  return 1;
};

const file = await fs.readFile(INPUT, 'utf8');
/** @type {{ light: Record<string,string>, dark: Record<string,string> }} */
const theme = JSON.parse(file);

const keys = Object.keys(theme.light);

// ── Kiểm tra hợp đồng dữ liệu TRƯỚC khi sinh ────────────────────────────────
// Sinh ra file hỏng rồi mới phát hiện thì lỗi hiện ra ở tận Metro, dưới dạng
// "class không có tác dụng" — không có dòng nào chỉ về đây.
const problems = [];
/** @type {Record<string, { light: ReturnType<typeof toChannels>, dark: ReturnType<typeof toChannels> }>} */
const parsed = {};

for (const k of keys) {
  if (!(k in theme.dark)) {
    problems.push(`token "${k}" có ở light nhưng THIẾU ở dark`);
    continue;
  }
  const light = toChannels(theme.light[k]);
  const dark = toChannels(theme.dark[k]);
  if (!light) problems.push(`token "light.${k}" = "${theme.light[k]}" — không nhận dạng được màu`);
  if (!dark) problems.push(`token "dark.${k}" = "${theme.dark[k]}" — không nhận dạng được màu`);
  if (!light || !dark) continue;

  // Nhóm của token quyết định color function, mà color function chỉ khai được
  // MỘT lần trong tailwind.config — không rẽ nhánh theo theme được. Có 4 token
  // (`nav-border`, `nav-divider`, `header-border`, `popup-border`) đặc ở light
  // nhưng trong ở dark: viền vẽ trên nền đổi màu thì để alpha là đúng thiết kế.
  // Nên luật là CHỈ CẦN MỘT theme có alpha ⇒ cả token dùng dạng có alpha, theme
  // còn lại ghi `/ 1` cho đủ bốn phần. Không phải sửa file nguồn.
  const hasAlpha = light.hasAlpha || dark.hasAlpha;
  const fill = (c) => (hasAlpha && !c.hasAlpha ? { ...c, channels: `${c.channels} / 1` } : c);
  parsed[k] = { light: fill(light), dark: fill(dark), hasAlpha };
}
for (const k of Object.keys(theme.dark)) {
  if (!(k in theme.light)) problems.push(`token "${k}" có ở dark nhưng THIẾU ở light`);
}
if (problems.length) {
  console.error('❌ colors.json không hợp lệ:');
  problems.forEach((p) => console.error('   ·', p));
  process.exit(1);
}

const alphaKeys = keys.filter((k) => parsed[k].hasAlpha);
const solidKeys = keys.filter((k) => !parsed[k].hasAlpha);

// ── 1. colors.generated.js — nguồn cho tailwind.config.js ──────────────────
const varLines = (mode) =>
  keys.map((k) => `    '--${k}': '${parsed[k][mode].channels}',`).join('\n');

const paletteJs = `/* ${BANNER} */
/* eslint-disable */
// prettier-ignore
module.exports = {
  /** Biến CSS — bơm vào :root (light) và .dark (dark) bằng plugin addBase. */
  vars: {
    light: {
${varLines('light')}
    },
    dark: {
${varLines('dark')}
    },
  },
  /** Token ĐẶC — map \`rgb(var(--x) / <alpha-value>)\`, DÙNG ĐƯỢC modifier độ trong. */
  solidTokens: [
${solidKeys.map((k) => `    '${k}',`).join('\n')}
  ],
  /** Token CÓ SẴN ĐỘ TRONG — map \`rgb(var(--x))\`, KHÔNG dùng được modifier. */
  alphaTokens: [
${alphaKeys.map((k) => `    '${k}',`).join('\n')}
  ],
};
`;

// ── 2. colors.generated.ts — cho prop cần MÀU THÔ (không phải className) ─────
// Vd: `tabBarActiveTintColor`, `<Ionicons color>`, `StatusBar backgroundColor`,
// theme của React Navigation, `barStyle` của Android nav bar.
const tsEntries = (mode) => keys.map((k) => `  '${k}': '${toHex(theme[mode][k])}',`).join('\n');

const alphaEntries = alphaKeys
  .map((k) => `  '${k}': { light: ${alphaOf(theme.light[k])}, dark: ${alphaOf(theme.dark[k])} },`)
  .join('\n');

const tsOut = `/** ${BANNER} */

export type ThemeColorKey =
${keys.map((k) => `  | '${k}'`).join('\n')};

export const THEME_COLOR_KEYS = [
${keys.map((k) => `  '${k}',`).join('\n')}
] as const satisfies readonly ThemeColorKey[];

/**
 * Màu chế độ SÁNG, dạng \`#RRGGBB\`.
 *
 * ⚠️ Đây là màu ĐẶC. Token vốn có độ trong bị cắt phần alpha ở đây vì phần lớn
 * prop màu thô của React Native (\`tabBarActiveTintColor\`, \`<Ionicons color>\`)
 * chỉ nhận màu đặc. Cần cả alpha thì tra thêm \`TOKEN_ALPHA\` bên dưới.
 */
export const LIGHT_COLORS: Record<ThemeColorKey, string> = {
${tsEntries('light')}
};

/** Màu chế độ TỐI, dạng \`#RRGGBB\`. */
export const DARK_COLORS: Record<ThemeColorKey, string> = {
${tsEntries('dark')}
};

/** Độ trong gốc của những token KHÔNG đục. Token không có tên ở đây ⇒ alpha = 1. */
export const TOKEN_ALPHA: Partial<Record<ThemeColorKey, { light: number; dark: number }>> = {
${alphaEntries}
};
`;

await fs.mkdir(path.dirname(JS_OUT), { recursive: true });
await fs.writeFile(JS_OUT, paletteJs);
await fs.mkdir(path.dirname(TS_OUT), { recursive: true });
await fs.writeFile(TS_OUT, tsOut);

console.log(
  `✅ ${path.relative(ROOT, JS_OUT)} — ${solidKeys.length} token đặc + ${alphaKeys.length} token có độ trong`,
);
console.log(`✅ ${path.relative(ROOT, TS_OUT)} — ${keys.length} token × 2 theme`);
