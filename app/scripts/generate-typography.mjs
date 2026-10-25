/**
 * generate-typography.mjs — sinh thang chữ cho NativeWind + TypeScript.
 *
 * NGUỒN DUY NHẤT: `src/styles/typography/typography.json`.
 *
 * ── Thang theo VAI TRÒ, không theo kích thước ────────────────────────────────
 * Class là `text-body`, `text-title`, `text-caption` — KHÔNG phải `text-sm`,
 * `text-lg`. Lý do: khi cần hạ cỡ chữ nội dung toàn app (đã xảy ra thật ở
 * vci-sun-mobile: body 17 → 16 sau khi thử trên máy thật), sửa MỘT dòng trong
 * JSON là xong. Nếu code rải `text-[17px]` thì phải đi lùng từng chỗ, và không
 * có cách nào biết chỗ nào là "nội dung", chỗ nào là "nhãn".
 *
 * ── ⛔ Luật lineHeight — ĐO TỪ FONT, không phải con số ước lượng ─────────────
 * Tiếng Việt xếp dấu CHỒNG hai tầng: `Ẳ` = A + dấu á + dấu hỏi. Khi `lineHeight`
 * quá sát `fontSize`, **Android CẮT CỤT phần dấu phía trên** — người dùng thấy
 * "A" thay vì "Ẳ". iOS thì cho tràn ra ngoài chứ không cắt, nên lỗi này CHỈ hiện
 * trên Android và rất dễ lọt qua khâu review làm trên máy Mac.
 *
 * Ngưỡng an toàn là THUỘC TÍNH CỦA FONT, nên script tự ĐO (xem
 * `scripts/lib/font-metrics.mjs`) thay vì viết cứng — đổi font là ngưỡng tự đổi
 * theo, không có con số cũ nào kẹt lại.
 *
 * Hai bậc ngưỡng, vì hai loại chữ chịu rủi ro khác nhau:
 *
 *  · **Chữ IN HOA** (`uppercase: true`) — bậc ĐO ĐƯỢC, hiện là ~1.47× với
 *    Be Vietnam Pro Bold. Nhãn kiểu "ĐỊA CHỈ" có cả `Ẳ` (cao nhất) lẫn `Ạ`
 *    (thấp nhất) trên CÙNG một dòng, nên phải chứa trọn hộp bao xấu nhất.
 *
 *  · **Chữ thường/hỗn hợp** — 1.30×. Chữ thường có dấu (`ằ`, `ộ`) thấp hơn hẳn
 *    bản in hoa, và 1.30 vẫn nằm TRÊN chiều cao dòng tự nhiên mà chính font khai
 *    (`hhea`: 1.265× ở Be Vietnam Pro). Ép cả thang lên 1.47 thì dòng chữ thưa
 *    tới mức đọc rời rạc — trả giá bố cục cho một rủi ro không tồn tại.
 *
 * Cần chữ IN HOA thì dùng vai trò `overline` (đã khai `uppercase`), đừng viết
 * `uppercase` lên một vai trò khác — ngưỡng của vai trò đó không được kiểm cho
 * trường hợp đó.
 *
 * ⛔ Đừng sửa file `*.generated.*` — lần chạy sau ghi đè sạch.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measureFontFamily } from './lib/font-metrics.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const INPUT = path.join(ROOT, 'src/styles/typography/typography.json');
const FONT_DIR = path.join(ROOT, 'assets/fonts');
const JS_OUT = path.join(ROOT, 'src/styles/typography/typography.generated.js');
const TS_OUT = path.join(ROOT, 'src/shared/theme/typography.generated.ts');

const BANNER = 'Sinh tự động từ typography.json. ⛔ ĐỪNG SỬA TAY.';

/**
 * Ngưỡng cho chữ thường/hỗn hợp. Trên chiều cao dòng tự nhiên của font (1.265×)
 * một khoảng đủ để dấu chồng của chữ THƯỜNG không chạm mép.
 */
const MIN_RATIO_MIXED_CASE = 1.3;

/** Dùng khi không đo được font (thiếu file, hoặc font nét CFF `.otf`). */
const FALLBACK_RATIO_UPPERCASE = 1.47;

// ── Đo font ─────────────────────────────────────────────────────────────────
let fontFiles = [];
try {
  fontFiles = (await fs.readdir(FONT_DIR))
    .filter((f) => f.toLowerCase().endsWith('.ttf'))
    .map((f) => path.join(FONT_DIR, f));
} catch {
  // Thư mục font chưa có — rơi xuống nhánh dự phòng bên dưới.
}

const metrics = fontFiles.length > 0 ? measureFontFamily(fontFiles) : null;

const minRatioUppercase = metrics
  ? Math.ceil(metrics.vietnameseRatio * 100) / 100
  : FALLBACK_RATIO_UPPERCASE;

if (metrics) {
  console.log(
    `📐 Đo ${metrics.files} file font: tiếng Việt cần ${metrics.vietnameseRatio.toFixed(3)}em ` +
      `(cao nhất "${metrics.tallestChar}", thấp nhất "${metrics.lowestChar}"), ` +
      `chỉ Latin cần ${metrics.asciiRatio.toFixed(3)}em ` +
      `→ ngưỡng chữ IN HOA ${minRatioUppercase}×`,
  );
} else {
  console.warn(
    `⚠️  Không đo được font trong ${path.relative(ROOT, FONT_DIR)} — ` +
      `dùng ngưỡng dự phòng ${FALLBACK_RATIO_UPPERCASE}× cho chữ IN HOA.`,
  );
}

// ── Đọc + kiểm tra thang chữ ────────────────────────────────────────────────
const { family, roles, weights } = JSON.parse(await fs.readFile(INPUT, 'utf8'));

const problems = [];

/**
 * Tên họ font là NGUỒN DUY NHẤT cho ba nơi phải khớp nhau từng ký tự:
 * `app.config.ts` (đăng ký native), `tailwind.config.js` (class `font-sans`) và
 * prop `fontFamily` thô của React Navigation. Lệch một ký tự thì chữ lặng lẽ
 * rơi về font hệ thống — không có lỗi nào báo, chỉ là chữ trông khác.
 */
if (typeof family !== 'string' || family.length === 0) {
  problems.push('"family" phải là tên họ font, vd "Plus Jakarta Sans"');
}
for (const [name, role] of Object.entries(roles)) {
  if (typeof role.size !== 'number' || role.size <= 0) {
    problems.push(`"${name}.size" phải là số dương`);
    continue;
  }
  if (typeof role.lineHeight !== 'number') {
    problems.push(`"${name}.lineHeight" phải là số`);
    continue;
  }
  const required = role.uppercase ? minRatioUppercase : MIN_RATIO_MIXED_CASE;
  const ratio = role.lineHeight / role.size;
  if (ratio < required) {
    problems.push(
      `"${name}" có lineHeight ${role.lineHeight}/${role.size} = ${ratio.toFixed(2)}× — ` +
        `dưới ngưỡng ${required}× cho chữ ${role.uppercase ? 'IN HOA' : 'thường/hỗn hợp'}. ` +
        `Android sẽ CẮT dấu (Ẳ · Ộ · ữ). Nâng lineHeight lên tối thiểu ` +
        `${Math.ceil(role.size * required)}px.`,
    );
  }
}
if (problems.length) {
  console.error('❌ typography.json không hợp lệ:');
  problems.forEach((p) => console.error('   ·', p));
  process.exit(1);
}

const roleNames = Object.keys(roles);
const weightNames = Object.keys(weights);

// ── 1. typography.generated.js — nguồn cho tailwind.config.js ───────────────
const fontSizeEntries = roleNames
  .map((name) => {
    const role = roles[name];
    const extra = [`lineHeight: '${role.lineHeight}px'`];
    if (role.letterSpacing !== undefined) extra.push(`letterSpacing: '${role.letterSpacing}px'`);
    return `    '${name}': ['${role.size}px', { ${extra.join(', ')} }],`;
  })
  .join('\n');

const jsOut = `/* ${BANNER} */
/* eslint-disable */
// prettier-ignore
module.exports = {
  /** Tên họ font — phải khớp ĐÚNG chuỗi khai trong app.config.ts. */
  family: '${family}',
  /** theme.fontSize cho Tailwind — class \`text-<vai trò>\`. */
  fontSize: {
${fontSizeEntries}
  },
  /** theme.fontWeight — class \`font-<tên>\`. */
  fontWeight: {
${weightNames.map((name) => `    '${name}': '${weights[name]}',`).join('\n')}
  },
};
`;

// ── 2. typography.generated.ts — cho prop STYLE thô của React Native ────────
// Vd: `headerTitleStyle` của React Navigation, hay component buộc phải nhận
// style object (Animated.Text, <Text> của react-native-svg).
const tsEntries = roleNames
  .map((name) => {
    const role = roles[name];
    const parts = [`fontSize: ${role.size}`, `lineHeight: ${role.lineHeight}`];
    if (role.letterSpacing !== undefined) parts.push(`letterSpacing: ${role.letterSpacing}`);
    if (role.uppercase) parts.push(`textTransform: 'uppercase'`);
    return `  '${name}': { ${parts.join(', ')} },`;
  })
  .join('\n');

const tsOut = `/** ${BANNER} */
import type { TextStyle } from 'react-native';

/**
 * Tên họ font, cho prop \`fontFamily\` THÔ (React Navigation, Animated.Text,
 * \`<Text>\` của react-native-svg). Ở JSX thường thì không cần — class
 * \`font-sans\` đã trỏ về đúng họ này.
 *
 * ⛔ Đừng viết lại chuỗi này bằng tay ở nơi khác: lệch một ký tự là chữ rơi về
 * font hệ thống, không có lỗi nào báo.
 */
export const FONT_FAMILY = '${family}';

export type TypographyRole =
${roleNames.map((n) => `  | '${n}'`).join('\n')};

export const TYPOGRAPHY_ROLES = [
${roleNames.map((n) => `  '${n}',`).join('\n')}
] as const satisfies readonly TypographyRole[];

/**
 * Số đo chữ theo vai trò — dùng cho prop \`style\` khi KHÔNG dùng được className.
 * Ưu tiên className (\`text-body\`) ở mọi chỗ có thể; đây là lối thoát, không
 * phải lối chính.
 */
export const TEXT_STYLES: Record<TypographyRole, TextStyle> = {
${tsEntries}
};

/**
 * Vai trò dành cho chữ IN HOA — lineHeight của nó đã được kiểm theo ngưỡng
 * ${minRatioUppercase}× (đo từ chính file font). ⛔ Đừng tự thêm \`uppercase\` lên
 * vai trò khác: ngưỡng của vai trò đó KHÔNG kiểm cho trường hợp này, và dấu
 * tiếng Việt sẽ bị Android cắt.
 */
export const UPPERCASE_ROLES = [
${roleNames
  .filter((n) => roles[n].uppercase)
  .map((n) => `  '${n}',`)
  .join('\n')}
] as const satisfies readonly TypographyRole[];

export type FontWeightName =
${weightNames.map((n) => `  | '${n}'`).join('\n')};

export const FONT_WEIGHTS: Record<FontWeightName, TextStyle['fontWeight']> = {
${weightNames.map((name) => `  '${name}': '${weights[name]}',`).join('\n')}
};
`;

await fs.mkdir(path.dirname(JS_OUT), { recursive: true });
await fs.writeFile(JS_OUT, jsOut);
await fs.mkdir(path.dirname(TS_OUT), { recursive: true });
await fs.writeFile(TS_OUT, tsOut);

console.log(`✅ ${path.relative(ROOT, JS_OUT)} — ${roleNames.length} vai trò chữ`);
console.log(
  `✅ ${path.relative(ROOT, TS_OUT)} — ${roleNames.length} vai trò × ${weightNames.length} độ đậm`,
);
