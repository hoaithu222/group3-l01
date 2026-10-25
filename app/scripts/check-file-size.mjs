/**
 * Soát ĐỘ DÀI file nguồn: `.tsx` ≤ 200 dòng, hook/util `.ts` ≤ 150 dòng.
 *
 * ── Vì sao cần ───────────────────────────────────────────────────────────────
 * `docs/rules/code-style.md` đặt trần này từ đầu, nhưng **không có gì chặn**.
 * Ba vòng sửa liên tiếp đều có file lặng lẽ vượt trần rồi phải tách chữa cháy
 * (`BottomSheet.tsx` lên 228, `Input.tsx` chạm đúng 200, `EmptyState.tsx` 208,
 * `SearchInput.tsx` 213). Không lần nào có gì đỏ — file chỉ dài dần lên qua
 * từng lần "thêm một trạng thái nữa", và tới lúc ai đó đọc thì nó đã là một
 * khối phải đọc cả mới sửa được một dòng.
 *
 * Cùng lối với `check-classes.mjs` · `check-contrast.mjs` ·
 * `check-touch-targets.mjs`: thứ gì đọc TĨNH được thì đặt hàng rào ở đây, đừng
 * trông vào người review nhớ đếm dòng.
 *
 * ── ⚠️ Vì sao KHÔNG áp trần 150 cho MỌI file `.ts` ──────────────────────────
 * Luật gốc viết là "**hook/util** `.ts` ≤ 150", không phải "mọi `.ts`". File
 * CÔNG THỨC và KHAI BÁO — `*.styles.ts`, `*.types.ts`, `*.constants.ts` — là
 * DỮ LIỆU chứ không phải logic: độ dài của chúng đến từ số biến thể của bản
 * thiết kế và mật độ chú thích giải thích từng số đo, không đến từ độ rắc rối
 * của luồng chạy. `button.styles.ts` dài 485 dòng vì `Button` có 5 kiểu × 3 cỡ
 * × 4 trạng thái, và mỗi khối màu đều kèm tỉ lệ tương phản đo tay — cắt đôi nó
 * chỉ đẻ ra `button.styles.part2.ts`, tức là thêm một file phải mở, chứ không
 * làm ai đọc dễ hơn.
 *
 * Nên ba hậu tố đó được **miễn trừ theo HẬU TỐ**, cố ý khai bằng tên chứ không
 * bằng "đoán xem file này có logic không": một luật đọc bằng mắt được thì người
 * ta biết trước mình đang ở phía nào của hàng rào.
 *
 * ⛔ Bỏ qua `*.generated.*`: chúng do `npm run generate:*` sinh ra, trần dòng
 * áp lên chúng là áp nhầm chỗ — muốn ngắn thì sửa bộ sinh, không sửa file.
 *
 * ── Nợ đã biết ───────────────────────────────────────────────────────────────
 * File đang vượt trần từ trước khai vào `scripts/file-size-manifest.json`, mỗi
 * mục kèm `why` và `max` = số dòng đo được LÚC KHAI. Nợ được phép tồn tại,
 * ⛔ không được phép PHÌNH thêm: vượt quá `max` là đỏ lại — cùng cách `floor`
 * của `contrast-manifest.json` giữ cho một ngoại lệ khai ở 4.45:1 không lặng lẽ
 * tha luôn cho 1.2:1.
 *
 * Chạy: node check-file-size.mjs [thư-mục...]
 */
import fs from 'node:fs';
import path from 'node:path';

import { ROOT, listSourceFiles, relative } from './lib/source-files.mjs';

const SCAN_DIRS = process.argv.slice(2).length ? process.argv.slice(2) : ['src', 'app'];

/**
 * ⚠️ `FILE_SIZE_MANIFEST` tồn tại DUY NHẤT để `tests/scripts/check-gates.test.ts`
 * chĩa trình soát vào một manifest giả. Cây nguồn mồi của test nằm ở thư mục tạm
 * của hệ điều hành (⛔ không nằm trong repo, xem lý do ở đầu file test), nên nó
 * không thể dùng chung manifest thật. ⛔ Đừng dùng biến này trong lúc chạy thường.
 */
const MANIFEST_PATH = process.env.FILE_SIZE_MANIFEST
  ? path.resolve(process.env.FILE_SIZE_MANIFEST)
  : path.join(ROOT, 'scripts/file-size-manifest.json');

/** Trần của `docs/rules/code-style.md`. */
const LIMIT_TSX = 200;
const LIMIT_TS = 150;

/** Hậu tố được miễn trừ — xem khối "Vì sao KHÔNG áp trần 150" ở đầu file. */
const DATA_SUFFIXES = ['.styles.ts', '.types.ts', '.constants.ts'];

/**
 * Barrel THUẦN re-export cũng được miễn trừ, và đây là miễn trừ theo NỘI DUNG
 * chứ không theo tên file — cố ý.
 *
 * `src/shared/ui/index.ts` dài thêm mỗi lần bộ component có thành viên mới, nên
 * khai nó vào manifest nghĩa là phải nhích `max` sau mỗi vòng; lúc đó cái mốc
 * không còn canh được gì. Nhưng miễn trừ theo TÊN (`index.ts`) thì một barrel
 * lỡ mọc logic vào cũng thoát luôn — nên phải soi ruột: chỉ file mà MỌI câu lệnh
 * đều là `export … from '…'` mới được tha. Có một dòng `const`, một hàm, một
 * `if` là trần 150 áp lại ngay.
 */
function isPureBarrel(file) {
  if (!file.endsWith('index.ts')) return false;

  const source = fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '') // chú thích khối
    .replace(/^\s*\/\/.*$/gm, ''); // chú thích dòng

  const statements = source
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return statements.every((statement) => /^export\s[\s\S]*\sfrom\s+'[^']+'$/.test(statement));
}

/** Trần của một file, hoặc `null` khi file được miễn trừ. */
function capOf(file) {
  if (file.endsWith('.tsx')) return LIMIT_TSX;
  if (DATA_SUFFIXES.some((suffix) => file.endsWith(suffix))) return null;
  if (isPureBarrel(file)) return null;
  return LIMIT_TS;
}

/**
 * Số dòng của file — đếm như `wc -l`, tức KHÔNG tính dòng rỗng cuối do ký tự
 * xuống dòng cuối file sinh ra. Nhờ vậy con số ở đây khớp với số mà người ta
 * thấy trong trình soạn thảo và trong `wc -l`, không lệch một đơn vị.
 */
function countLines(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.length;
}

// ── 1. Đo ───────────────────────────────────────────────────────────────────

const files = listSourceFiles(SCAN_DIRS);

/** `src/core/api/client.ts` → { lines, cap } — chỉ file KHÔNG được miễn trừ. */
const measured = new Map();
let exempt = 0;

for (const file of files) {
  const cap = capOf(file);
  if (cap === null) {
    exempt++;
    continue;
  }
  measured.set(relative(file), { cap, lines: countLines(file) });
}

// ── 2. Manifest — nợ đã biết ────────────────────────────────────────────────

const manifest = fs.existsSync(MANIFEST_PATH)
  ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  : { debt: [] };

const manifestErrors = [];
/** đường dẫn → `max` đã khai. */
const debt = new Map();
/** Mục khai rồi mà không còn tác dụng — cảnh báo, ⛔ KHÔNG làm đỏ cổng kiểm. */
const stale = [];

for (const entry of manifest.debt ?? []) {
  const label = entry.file ?? '(thiếu "file")';
  if (!entry.file) manifestErrors.push(`debt: thiếu "file"`);
  if (!entry.why) manifestErrors.push(`debt ${label}: thiếu "why" — nợ phải nói rõ vì sao còn đó`);
  if (typeof entry.max !== 'number')
    manifestErrors.push(`debt ${label}: thiếu "max" (số dòng đo được lúc khai)`);
  if (!entry.file || typeof entry.max !== 'number') continue;

  const current = measured.get(entry.file);
  if (!current) {
    // File đã bị xoá, đổi tên, hoặc rơi vào diện miễn trừ.
    stale.push(`${entry.file} — không còn trong diện soát (đã xoá/đổi tên/được miễn trừ)`);
    continue;
  }
  if (entry.max <= current.cap) {
    manifestErrors.push(
      `debt ${entry.file}: "max" ${String(entry.max)} không lớn hơn trần ${String(current.cap)} — mục này vô nghĩa`,
    );
    continue;
  }
  if (current.lines <= current.cap) {
    stale.push(`${entry.file} — đã về ${String(current.lines)} dòng, dưới trần. Xoá mục này đi.`);
    continue;
  }
  debt.set(entry.file, entry.max);
}

// ── 3. Đối chiếu ────────────────────────────────────────────────────────────

/** Vượt trần và CHƯA khai nợ. */
const over = [];
/** Đã khai nợ nhưng PHÌNH quá `max`. */
const grown = [];

for (const [file, { cap, lines }] of measured) {
  if (lines <= cap) continue;
  const max = debt.get(file);
  if (max === undefined) over.push({ cap, file, lines });
  else if (lines > max) grown.push({ cap, file, lines, max });
}

// ── 4. Báo ──────────────────────────────────────────────────────────────────

console.log(`Đã quét ${String(files.length)} file trong: ${SCAN_DIRS.join(', ')}`);
console.log(
  `Có trần: ${String(measured.size)} (.tsx ≤ ${String(LIMIT_TSX)} · .ts ≤ ${String(LIMIT_TS)}) · ` +
    `miễn trừ theo hậu tố: ${String(exempt)} · nợ đã khai: ${String(debt.size)}`,
);

if (stale.length) {
  console.log('\n⚠️ Mục THỪA trong file-size-manifest.json:');
  for (const line of stale) console.log(`  ${line}`);
}

if (manifestErrors.length) {
  console.log('\n❌ file-size-manifest.json sai:');
  for (const message of manifestErrors) console.log(`  ${message}`);
}

if (over.length) {
  console.log(`\n❌ ${String(over.length)} file VƯỢT trần độ dài:\n`);
  for (const item of over.sort((a, b) => b.lines - a.lines))
    console.log(`  ${item.file} — ${String(item.lines)} dòng, trần ${String(item.cap)}`);
  console.log(
    '\nTách bớt sang file cùng thư mục (xem `input/InputControls.tsx`,\n' +
      '`bottom-sheet/SheetSurface.tsx`). Không tách được ngay thì khai vào\n' +
      '`scripts/file-size-manifest.json` kèm `why`. ⛔ Đừng nới trần trong script.',
  );
}

if (grown.length) {
  console.log(`\n❌ ${String(grown.length)} file đã khai nợ nhưng còn PHÌNH thêm:\n`);
  for (const item of grown.sort((a, b) => b.lines - b.max - (a.lines - a.max)))
    console.log(
      `  ${item.file} — ${String(item.lines)} dòng, đã khai tối đa ${String(item.max)} ` +
        `(trần ${String(item.cap)})`,
    );
  console.log(
    '\nNợ được phép tồn tại, ⛔ không được phép lớn thêm. Tách file, hoặc — nếu\n' +
      'lần thêm này là bắt buộc — sửa `max` trong manifest kèm lý do mới.',
  );
}

if (over.length === 0 && grown.length === 0 && manifestErrors.length === 0) {
  console.log('\n✅ Mọi file đều trong trần độ dài (hoặc là nợ đã khai và không phình thêm).');
  process.exit(0);
}

process.exit(1);
