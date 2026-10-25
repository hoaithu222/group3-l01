/**
 * Tính LẠI tỉ lệ tương phản WCAG từ `colors.json` cho mọi cặp nền + chữ tìm
 * thấy trong mã nguồn — ở CẢ hai chế độ sáng và tối.
 *
 * ── Vì sao cần ───────────────────────────────────────────────────────────────
 * Repo này đo tương phản BẰNG TAY rồi ghi con số vào chú thích ở khoảng 20 file
 * (`Divider.tsx`, `input.styles.ts`, `Checkbox.tsx`, `SliderDotItem.tsx`,
 * `bottom-nav.styles.ts`…). Đó là công sức lớn và là kiến thức thật — nhưng nó
 * **mục lặng lẽ**: sửa một dòng trong `colors.json` là mọi con số đó sai, chú
 * thích vẫn nằm nguyên, không có gì đỏ. Riêng bốn vòng sửa vừa rồi đã đụng vào
 * `colors.json` bốn lần.
 *
 * Ở đây làm như `check-classes.mjs` làm với class: không tin bảng đối chiếu
 * tay, mà **tính lại từ nguồn** mỗi lần chạy.
 *
 * ── Ranh giới: cái này KHÔNG làm gì ──────────────────────────────────────────
 * Trình soát chỉ ghép được cặp khi nền và chữ ở GẦN nhau trong cú pháp:
 *
 *   1. cùng MỘT chuỗi class — `className="bg-bg-1 text-fg-1"`;
 *   2. cùng MỘT object — đúng khuôn `tv()` của repo, nơi nền nằm ở slot `root`
 *      còn màu chữ ở slot `label` của cùng một biến thể:
 *      `{ root: 'bg-action-base', label: 'text-action-fg' }`.
 *
 * ⛔ Nó KHÔNG suy ra nền từ cây JSX (`<View className="bg-bg-2">` bọc ngoài một
 * `<Text className="text-fg-3">` ở file khác), và KHÔNG ghép nền ở object gốc
 * với màu chữ ở object biến thể. Những cặp đó phải khai tay trong
 * `scripts/contrast-manifest.json` — xem `pairs` ở đó.
 *
 * Đánh đổi có chủ ý: thà **bỏ sót** còn hơn báo nhầm. Một trình soát báo hàng
 * trăm lỗi là một trình soát không ai chạy.
 *
 * ── Phần thứ hai: CHỮ MỜ (`text-fg-3|4|5`) — chặn thẳng, không cần ghép nền ──
 * Chỗ hổng lớn nhất của phần ghép cặp ở trên là đúng cái nó nói: `<Text
 * className="text-fg-3">` nằm trong một `<View>` khác, ở file khác, nên nền không
 * bao giờ ghép được và cặp bị BỎ SÓT. Ở đây làm khác: không đoán nền, mà tính xem
 * token chữ đó có đạt 4.5:1 trên bất kỳ nền nào của bảng màu không. `fg-3` đạt tối
 * đa 2.96:1 (`fg-4` 1.73:1) ở chế độ sáng — tức là dùng làm màu chữ NỘI DUNG thì
 * hỏng trên MỌI nền, nên bắt được mà không cần biết nền. Chúng chỉ hợp lệ cho
 * placeholder/chữ giữ chỗ (xem `src/shared/ui/AGENTS.md`). Ngoại lệ khai ở
 * `mutedText.allow` của manifest, mỗi mục có `max` (số lần dùng lúc khai) để nợ
 * không phình thêm.
 *
 * ── Ngưỡng (WCAG 2.1 AA) ─────────────────────────────────────────────────────
 *   chữ thường                              4.5:1
 *   chữ ≥ 18px, hoặc ≥ 14px nét đậm         3:1
 *   hình/viền phi văn bản                   3:1
 * Cỡ chữ suy từ class `text-<vai-trò>` trong CÙNG chuỗi, tra
 * `src/styles/typography/typography.json`. Không suy được thì lấy ngưỡng CHẶT
 * (4.5) — và cặp nào thật sự là chữ to thì khai vào manifest.
 *
 * ⚠️ Token CÓ SẴN ĐỘ TRONG (`bg-primary` 10%, `overlay`, `white-*`, `black-*`)
 * phải trộn với nền nằm dưới mới ra màu thật. Không biết nền dưới là gì thì
 * ⛔ KHÔNG đoán: cặp đó bị BỎ QUA và được liệt kê ở cuối. Muốn kiểm nó thì khai
 * `over` trong manifest để chỉ đích danh nền phía dưới.
 *
 * Chạy: node check-contrast.mjs [thư-mục...]
 */
import fs from 'node:fs';
import path from 'node:path';

import { ROOT, listSourceFiles, parseSource, relative, ts } from './lib/source-files.mjs';

const SCAN_DIRS = process.argv.slice(2).length ? process.argv.slice(2) : ['src', 'app'];
/**
 * ⚠️ `CONTRAST_MANIFEST` tồn tại DUY NHẤT để `tests/scripts/check-gates.test.ts` chĩa trình
 * soát vào một manifest giả (cây nguồn mồi nằm ở thư mục tạm, khai `mutedText.allow` theo
 * đường dẫn của chính nó — cùng lý do `FILE_SIZE_MANIFEST` ở `check-file-size.mjs`).
 * ⛔ Đừng dùng biến này trong lúc chạy thường.
 */
const MANIFEST_PATH = process.env.CONTRAST_MANIFEST
  ? path.resolve(process.env.CONTRAST_MANIFEST)
  : path.join(ROOT, 'scripts/contrast-manifest.json');

// ── 1. Token màu và thang chữ ───────────────────────────────────────────────

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const COLORS = readJson('src/styles/colors/colors.json');
const TYPOGRAPHY = readJson('src/styles/typography/typography.json');

const MODES = ['light', 'dark'];
const MODE_LABEL = { light: 'sáng', dark: 'tối' };

/** Tên token hợp lệ — dùng để phân biệt `text-fg-1` (màu) với `text-center`. */
const TOKEN_NAMES = new Set(Object.keys(COLORS.light));

/** `text-body-md` là CỠ CHỮ, không phải màu — và cỡ đó quyết định ngưỡng. */
const ROLE_SIZE = new Map(
  Object.entries(TYPOGRAPHY.roles).map(([role, spec]) => [role, spec.size]),
);

/** Nét ≥ 700 mới được tính là "đậm" theo WCAG (600 = semibold thì KHÔNG). */
const BOLD_CLASSES = new Set(
  Object.entries(TYPOGRAPHY.weights)
    .filter(([, weight]) => weight >= 700)
    .map(([name]) => `font-${name}`),
);

/** `#RRGGBB` · `#RRGGBBAA` · `rgba(r,g,b,a)` → `{ r, g, b, a }`. */
function parseColor(value) {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    const h = value.slice(1);
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }; // prettier-ignore
  }
  if (/^#[0-9a-f]{8}$/i.test(value)) {
    const h = value.slice(1);
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: parseInt(h.slice(6, 8), 16) / 255 }; // prettier-ignore
  }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  return null;
}

/** `{ light: { 'fg-1': {r,g,b,a} }, dark: … }` */
const PALETTE = Object.fromEntries(
  MODES.map((mode) => [
    mode,
    Object.fromEntries(
      Object.entries(COLORS[mode]).map(([token, value]) => [token, parseColor(value)]),
    ),
  ]),
);

// ── 2. Toán WCAG ────────────────────────────────────────────────────────────

/** Độ chói tương đối, công thức WCAG 2.1 §Relative luminance. */
function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Tỉ lệ tương phản giữa hai màu ĐỤC. */
function contrastRatio(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** Trộn `fg` (có độ trong) lên `bg` (đục) — luật alpha compositing thường. */
function flatten(fg, bg) {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

// ── 3. Class → token ────────────────────────────────────────────────────────

/**
 * `bg-action-base` → `action-base`; `text-action-fg/80` → `action-fg` @ 0.8.
 *
 * Trả `null` khi không phải class màu — `text-center`, `text-body-lg`,
 * `bg-transparent`, hay bất cứ tên nào không có trong `colors.json`.
 *
 * ⛔ Bỏ class có biến thể KHÁC `dark:` (`tablet:bg-bg-2`, `active:…`): chúng chỉ
 * áp trong một điều kiện, ghép thẳng vào cặp là báo nhầm.
 */
function colorClass(cls, prefix) {
  const segments = cls.split(':');
  const utility = segments.pop();
  const variants = segments;
  if (variants.some((v) => v !== 'dark')) return null;
  if (!utility.startsWith(`${prefix}-`)) return null;

  const [name, opacity] = utility.slice(prefix.length + 1).split('/');
  if (!TOKEN_NAMES.has(name)) return null;
  if (opacity !== undefined && !/^\d+$/.test(opacity)) return null;

  return {
    token: name,
    alpha: opacity === undefined ? 1 : Number(opacity) / 100,
    darkOnly: variants.includes('dark'),
  };
}

/** Ngưỡng của một chuỗi class có màu chữ: 3.0 nếu là chữ TO, 4.5 nếu không. */
function textThreshold(classes) {
  const bold = classes.some((c) => BOLD_CLASSES.has(c));
  for (const cls of classes) {
    const size = ROLE_SIZE.get(cls.replace(/^text-/, ''));
    if (size === undefined || !cls.startsWith('text-')) continue;
    if (size >= 18 || (size >= 14 && bold)) return { min: 3, why: `${String(size)}px` };
    return { min: 4.5, why: `${String(size)}px` };
  }
  return { min: 4.5, why: 'không rõ cỡ ⇒ lấy ngưỡng chặt' };
}

// ── 4. Thu thập cặp từ mã nguồn ─────────────────────────────────────────────

/**
 * Chỉ nhận chuỗi trông như danh sách class — cùng bộ lọc `check-classes.mjs`
 * dùng, để câu văn tiếng Việt trong chú thích và thông báo lỗi không lọt vào.
 */
const CLASSISH = /^-?[a-z0-9]+(?:[-/:.[\]()#%,]|[a-z0-9])*$/;
const classesOf = (text) => {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return parts.length && parts.every((p) => CLASSISH.test(p)) ? parts : [];
};

/**
 * Trạng thái VÔ HIỆU không có yêu cầu tương phản — WCAG 2.1 §1.4.3 và §1.4.11
 * loại trừ đích danh "thành phần giao diện đang không hoạt động".
 *
 * ⛔ Đây KHÔNG phải nới ngưỡng cho tiện: chữ mờ chính là TÍN HIỆU cho biết nút
 * bấm không được. Ép nó lên 4.5:1 là buộc nút vô hiệu trông y như nút bấm được,
 * tức là làm giao diện KHÓ hiểu hơn. Repo có 7 token mang chữ `disabled`, và
 * mọi cặp dính tới chúng đều rơi vào ngoại lệ này.
 */
const isDisabledToken = (token) => token.includes('disabled');

/** cặp đã gặp: khoá `bg|fg|min` → { bg, fg, min, why, where[] } */
const found = new Map();

function addPair(bg, fg, threshold, where) {
  if (bg.token === fg.token) return;
  if (isDisabledToken(bg.token) || isDisabledToken(fg.token)) return;
  const key = `${bg.token}/${String(bg.alpha)}|${fg.token}/${String(fg.alpha)}|${String(threshold.min)}`;
  const entry = found.get(key) ?? {
    bg,
    fg,
    min: threshold.min,
    why: threshold.why,
    where: [],
  };
  if (!entry.where.includes(where)) entry.where.push(where);
  found.set(key, entry);
}

/**
 * Ghép nền với chữ trong MỘT phạm vi (một chuỗi, hoặc một object của `tv()`).
 *
 * ⛔ Phạm vi có NHIỀU nền khác nhau thì bỏ qua hẳn: `bottom-nav.styles.ts` có
 * `root: 'bg-nav-to'` và `badge: 'bg-action-error'` trong cùng một object, ghép
 * chéo là ra một cặp không tồn tại trên màn hình.
 */
function pairScope(strings, where) {
  const backgrounds = [];
  const foregrounds = [];

  for (const classes of strings) {
    for (const cls of classes) {
      const bg = colorClass(cls, 'bg');
      if (bg) backgrounds.push(bg);
      const fg = colorClass(cls, 'text');
      if (fg) foregrounds.push({ ...fg, threshold: textThreshold(classes) });
    }
  }

  const distinct = new Set(backgrounds.map((b) => `${b.token}/${String(b.alpha)}`));
  if (distinct.size !== 1 || foregrounds.length === 0) return;

  for (const fg of foregrounds) {
    if (fg.darkOnly !== backgrounds[0].darkOnly) continue;
    addPair(backgrounds[0], fg, fg.threshold, where);
  }
}

const files = listSourceFiles(SCAN_DIRS);

// ── 4b. Chữ MỜ: token chữ không đạt 4.5:1 trên BẤT KỲ nền nào ──────────────

/**
 * Nền ĐỤC mà chữ NỘI DUNG nằm lên: nền màn/thẻ (`bg-base`, `bg-1…4`, `bg-input`, `bg-dialog`…) và `surface-*`.
 *
 * ⛔ Cố ý KHÔNG lấy mọi `bg-*`: `bg-tooltip` là nền TỐI đảo chiều (chữ sáng đặt lên nó) — lấy vào thì `fg-4`
 * "đạt" 11:1 ở chế độ sáng và rule mất tác dụng. Bản có độ trong (`bg-nav`, `bg-primary`…) bỏ qua vì không biết
 * nền nằm dưới.
 */
const TEXT_BACKGROUNDS = [...TOKEN_NAMES].filter((token) =>
  /^(bg-(base|[1-4]|input|dialog|popup|skeleton|ink-light)|surface-.+)$/.test(token),
);

/** Tỉ lệ TỐT NHẤT mà `fgToken` đạt được trên một nền nào đó của bảng màu, ở chế độ `mode`. */
function bestRatio(fgToken, mode) {
  const fg = PALETTE[mode][fgToken];
  let best = 0;
  for (const bgToken of TEXT_BACKGROUNDS) {
    const bg = PALETTE[mode][bgToken];
    if (!bg || bg.a < 1) continue;
    best = Math.max(best, contrastRatio(fg.a < 1 ? flatten(fg, bg) : fg, bg));
  }
  return best;
}

/**
 * `fg-3` · `fg-4` · `fg-5` — token chữ mà ngay cả trên nền THUẬN LỢI NHẤT vẫn dưới 4.5:1
 * ở ít nhất một chế độ. Tính từ `colors.json` mỗi lần chạy nên đổi bảng màu là tự cập nhật.
 */
const MUTED_TOKENS = new Map();
for (const token of TOKEN_NAMES) {
  if (!/^fg-\d+$/.test(token)) continue;
  const light = bestRatio(token, 'light');
  const dark = bestRatio(token, 'dark');
  if (Math.min(light, dark) < 4.5) MUTED_TOKENS.set(token, { light, dark });
}

/** file (đường dẫn từ gốc repo) → [{ line, token }] — mọi chỗ dùng `text-fg-3/4/5` làm màu chữ. */
const mutedUses = new Map();

function noteMuted(file, line, text) {
  for (const cls of classesOf(text)) {
    // ⛔ Bỏ class có biến thể (`dark:`, `tablet:`…): chỉ áp trong một điều kiện, không phán được.
    if (cls.includes(':')) continue;
    const match = /^text-(fg-\d+)$/.exec(cls);
    if (!match || !MUTED_TOKENS.has(match[1])) continue;
    const list = mutedUses.get(file) ?? [];
    list.push({ line, token: match[1] });
    mutedUses.set(file, list);
  }
}

for (const file of files) {
  const { source, where } = parseSource(file);
  const rel = relative(file);
  const isTestFile = /(^|\/)tests?\/|\.test\.tsx?$/.test(rel);

  if (!isTestFile) {
    (function visitMuted(node) {
      // Chuỗi đứng riêng, và MỌI mảnh của template (`text-caption-sm ${…} text-fg-3`).
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)
      ) {
        const line = Number(where(node.getStart()).split(':').pop());
        noteMuted(rel, line, node.text);
      }
      ts.forEachChild(node, visitMuted);
    })(source);
  }

  (function visit(node) {
    // Phạm vi 1 — một chuỗi class đứng riêng (`className="bg-bg-1 text-fg-1"`).
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const classes = classesOf(node.text);
      if (classes.length) pairScope([classes], where(node.getStart()));
    }

    /**
     * Phạm vi 2 — một object của `tv()`: nền ở slot này, màu chữ ở slot kia.
     *
     * ⛔ CHỈ lấy thuộc tính có giá trị là chuỗi TRỰC TIẾP, không đi xuống object
     * con. Đi xuống là gộp cả `variants: { selected: {…}, disabled: {…} }` thành
     * một phạm vi, rồi ghép nền của biến thể NÀY với màu chữ của biến thể KIA —
     * một cặp không bao giờ xuất hiện trên màn hình.
     */
    if (ts.isObjectLiteralExpression(node)) {
      const strings = [];
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        if (!ts.isStringLiteralLike(prop.initializer)) continue;
        const classes = classesOf(prop.initializer.text);
        if (classes.length) strings.push(classes);
      }
      if (strings.length > 1) pairScope(strings, where(node.getStart()));
    }

    ts.forEachChild(node, visit);
  })(source);
}

// ── 5. Manifest — cặp khai tay và ngoại lệ có chủ ý ─────────────────────────

/**
 * ⛔ Ngoại lệ phải khai TƯỜNG MINH ở đây, không được chữa bằng cách hạ ngưỡng.
 * Hạ ngưỡng là tắt trình soát cho TOÀN BỘ repo để cho qua MỘT cặp.
 */
const manifest = fs.existsSync(MANIFEST_PATH)
  ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  : { pairs: [], allow: [] };

const manifestErrors = [];
const checkToken = (token, label) => {
  if (token !== undefined && !TOKEN_NAMES.has(token))
    manifestErrors.push(`${label}: token "${token}" không có trong colors.json`);
};

for (const pair of manifest.pairs ?? []) {
  checkToken(pair.bg, 'pairs');
  checkToken(pair.fg, 'pairs');
  checkToken(pair.over, 'pairs');
  if (!pair.why) manifestErrors.push(`pairs ${pair.bg}/${pair.fg}: thiếu "why"`);
  const min = pair.kind === 'non-text' || pair.kind === 'large-text' ? 3 : 4.5;
  const key = `${pair.bg}/1|${pair.fg}/1|${String(min)}`;
  found.set(key, {
    bg: { token: pair.bg, alpha: 1 },
    fg: { token: pair.fg, alpha: 1 },
    min,
    why: pair.kind ?? 'text',
    where: [pair.where ?? 'contrast-manifest.json'],
    over: pair.over,
  });
}

for (const rule of manifest.allow ?? []) {
  checkToken(rule.bg, 'allow');
  checkToken(rule.fg, 'allow');
  if (!rule.why) manifestErrors.push(`allow ${rule.bg}/${rule.fg}: thiếu "why"`);
}

/** Hạn mức chữ mờ — `mutedText.allow[]`: `{ file, max, why }` — `max` là số chỗ dùng lúc khai. Vượt là đỏ lại. */
const mutedAllow = new Map();
for (const rule of manifest.mutedText?.allow ?? []) {
  if (!rule.file || !Number.isInteger(rule.max) || rule.max < 1)
    manifestErrors.push(
      `mutedText.allow ${String(rule.file)}: cần "file" và "max" là số nguyên ≥ 1`,
    );
  else if (!rule.why) manifestErrors.push(`mutedText.allow ${rule.file}: thiếu "why"`);
  else mutedAllow.set(rule.file, rule);
}

/**
 * Cặp `bg`+`fg` này có được tha ở chế độ `mode` không?
 *
 * ⚠️ `floor` là tỉ lệ ĐO ĐƯỢC lúc khai ngoại lệ. Tụt xuống dưới nữa thì ngoại
 * lệ HẾT hiệu lực và cặp lại đỏ — nếu không, một ngoại lệ khai cho 4.45:1 sẽ
 * lặng lẽ tha luôn cho 1.2:1 sau vài lần sửa `colors.json`. Đó đúng là kiểu mục
 * lặng lẽ mà trình soát này sinh ra để chặn.
 */
const usedAllows = new Set();
function allowedBy(bgToken, fgToken, mode, ratio) {
  for (const [index, rule] of (manifest.allow ?? []).entries()) {
    if (rule.bg !== bgToken || rule.fg !== fgToken) continue;
    if (rule.modes && !rule.modes.includes(mode)) continue;
    usedAllows.add(index);
    if (rule.floor !== undefined && round2(ratio) < rule.floor) return false;
    return true;
  }
  return false;
}

// ── 6. Đo và báo ────────────────────────────────────────────────────────────

const failures = [];
const skipped = [];

for (const entry of found.values()) {
  for (const mode of MODES) {
    const palette = PALETTE[mode];
    const rawBg = palette[entry.bg.token];
    const rawFg = palette[entry.fg.token];
    if (!rawBg || !rawFg) continue;

    let bg = { ...rawBg, a: rawBg.a * entry.bg.alpha };
    if (bg.a < 1) {
      const under = entry.over ? palette[entry.over] : null;
      if (!under || under.a < 1) {
        skipped.push({ ...entry, mode, reason: `nền "${entry.bg.token}" có độ trong` });
        continue;
      }
      bg = flatten(bg, under);
    }

    let fg = { ...rawFg, a: rawFg.a * entry.fg.alpha };
    if (fg.a < 1) fg = flatten(fg, bg);

    const ratio = contrastRatio(fg, bg);
    if (ratio >= entry.min) continue;
    if (allowedBy(entry.bg.token, entry.fg.token, mode, ratio)) continue;
    failures.push({ ...entry, mode, ratio });
  }
}

const staleAllows = (manifest.allow ?? [])
  .map((rule, index) => ({ rule, index }))
  .filter(({ index }) => !usedAllows.has(index));

console.log(`Đã quét ${String(files.length)} file trong: ${SCAN_DIRS.join(', ')}`);
console.log(
  `Cặp nền+chữ ghép được: ${String(found.size)} · đo ở 2 chế độ · bỏ qua vì nền trong suốt: ${String(skipped.length)}`,
);

if (skipped.length) {
  console.log('\n⚠️ BỎ QUA (không tính được nền thật — khai `over` trong manifest nếu cần đo):');
  const seen = new Set();
  for (const s of skipped) {
    const line = `  ${s.bg.token} + ${s.fg.token} — ${s.reason}`;
    if (seen.has(line)) continue;
    seen.add(line);
    console.log(`${line}\n      ${s.where[0]}`);
  }
}

if (staleAllows.length) {
  console.log('\n⚠️ Ngoại lệ THỪA trong contrast-manifest.json (cặp đã đạt hoặc không còn dùng):');
  for (const { rule } of staleAllows) console.log(`  ${rule.bg} + ${rule.fg}`);
}

if (manifestErrors.length) {
  console.log('\n❌ contrast-manifest.json sai:');
  for (const message of manifestErrors) console.log(`  ${message}`);
}

// ── Chữ MỜ — so số lần dùng thật với hạn mức khai trong manifest ────────────

const mutedFailures = [];
const mutedStale = [];
for (const [file, uses] of mutedUses) {
  const budget = mutedAllow.get(file)?.max ?? 0;
  // ⛔ Vượt hạn mức thì báo TOÀN BỘ chỗ dùng của file, không chỉ phần dư: không biết chỗ nào là "nợ cũ".
  if (uses.length > budget) mutedFailures.push({ file, uses, budget });
}
for (const [file, rule] of mutedAllow) {
  const used = mutedUses.get(file)?.length ?? 0;
  if (used < rule.max) mutedStale.push({ file, used, max: rule.max });
}

if (mutedStale.length) {
  console.log(
    '\n⚠️ Hạn mức chữ mờ THỪA trong contrast-manifest.json (đã sửa bớt — hạ `max` hoặc xoá mục):',
  );
  for (const s of mutedStale)
    console.log(`  ${s.file} — dùng ${String(s.used)}, khai ${String(s.max)}`);
}

if (failures.length === 0 && manifestErrors.length === 0 && mutedFailures.length === 0) {
  console.log('\n✅ Mọi cặp ghép được đều đạt ngưỡng WCAG ở cả chế độ sáng lẫn tối.');
  console.log(
    `✅ Không có chữ mờ (${[...MUTED_TOKENS.keys()].map((t) => `text-${t}`).join(' · ')}) ngoài hạn mức khai.`,
  );
  process.exit(0);
}

if (mutedFailures.length) {
  const total = mutedFailures.reduce((sum, f) => sum + f.uses.length, 0);
  console.log(
    `\n❌ ${String(total)} chỗ dùng CHỮ MỜ làm màu chữ nội dung, ở ${String(mutedFailures.length)} file:\n`,
  );
  for (const [token, ratios] of MUTED_TOKENS) {
    console.log(
      `  text-${token}: tối đa ${String(round2(ratios.light))}:1 (sáng) · ${String(round2(ratios.dark))}:1 (tối) — cần 4.5:1`,
    );
  }
  console.log('');
  for (const f of mutedFailures) {
    const budget = f.budget > 0 ? ` (hạn mức khai ${String(f.budget)})` : '';
    console.log(`  ${f.file}${budget}`);
    for (const use of f.uses.slice(0, 6))
      console.log(`      dòng ${String(use.line)}: text-${use.token}`);
    if (f.uses.length > 6) console.log(`      … và ${String(f.uses.length - 6)} chỗ nữa`);
  }
  console.log(
    '\nChữ NỘI DUNG (giờ, chú thích, mô tả, lý do…) dùng `text-fg-2` (≥ 5:1). `fg-3/4/5` chỉ cho placeholder / chữ giữ chỗ.\n' +
      'Nếu là chữ giữ chỗ THẬT thì khai vào `scripts/contrast-manifest.json` mục `mutedText.allow` kèm `why`.\n' +
      '⛔ Đừng hạ ngưỡng, đừng nâng `max` cho qua.',
  );
}

if (failures.length) {
  console.log(`\n❌ ${String(failures.length)} cặp DƯỚI ngưỡng tương phản:\n`);
  for (const f of failures.sort((a, b) => a.ratio - b.ratio)) {
    console.log(
      `  [${MODE_LABEL[f.mode]}] bg-${f.bg.token} + text-${f.fg.token} — ` +
        `${String(round2(f.ratio))}:1, cần ${String(f.min)}:1 (${f.why})`,
    );
    for (const where of f.where.slice(0, 3)) console.log(`      ${where}`);
  }
  console.log(
    '\nSửa bằng token khác, HOẶC — nếu lệch chuẩn là CÓ CHỦ Ý — khai vào\n' +
      '`scripts/contrast-manifest.json` mục `allow` kèm lý do. ⛔ Đừng hạ ngưỡng.',
  );
}

process.exit(1);
