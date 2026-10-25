/**
 * source-files.mjs — liệt kê và PHÂN TÍCH CÚ PHÁP file nguồn cho các trình soát.
 *
 * ── Vì sao dùng bộ phân tích của TypeScript chứ không phải regex ─────────────
 * `check-classes.mjs` soát từng chuỗi RỜI, nên regex là đủ: nó chỉ cần biết
 * "chuỗi này có phải danh sách class không". Hai trình soát dùng file này thì
 * cần thứ regex không cho được — **quan hệ giữa các chuỗi**:
 *
 *   · `check-contrast.mjs` phải biết `bg-action-base` và `text-action-fg` nằm
 *     trong CÙNG một object của `tv()` (nền và chữ của cùng một biến thể) hay ở
 *     hai công thức khác nhau (không liên quan gì tới nhau).
 *   · `check-touch-targets.mjs` phải biết `className` và `hitSlop` thuộc CÙNG
 *     một thẻ JSX.
 *
 * Đếm dấu ngoặc bằng tay thì sai ngay ở chuỗi có `{`, ở template literal, ở
 * comment — tức là sai ở đúng những file phức tạp nhất. `typescript` đã là
 * devDependency (chạy `npm run typecheck`), nên dùng bộ phân tích của nó không
 * thêm gói nào.
 *
 * ⚠️ Bỏ file `*.generated.*`: `icons.*.generated.ts` là danh sách TÊN ICON
 * trông y hệt class Tailwind — cùng lý do `check-classes.mjs` bỏ chúng.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** Gốc repo — file này nằm ở `scripts/lib/`, nên lùi HAI cấp. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const require = createRequire(path.join(ROOT, 'package.json'));

/** @type {import('typescript')} */
export const ts = require('typescript');

/** Đường dẫn tương đối, luôn dùng `/` để thông báo giống nhau trên mọi máy. */
export const relative = (file) => path.relative(ROOT, file).replace(/\\/g, '/');

/** Mọi file `.ts`/`.tsx` trong các thư mục cho trước, trừ file sinh tự động. */
export function listSourceFiles(dirs) {
  const files = [];
  for (const dir of dirs) {
    // `resolve` chứ không `join`: nhờ vậy test truyền được đường dẫn TUYỆT ĐỐI
    // tới một thư mục tạm ngoài repo, còn đường dẫn tương đối vẫn tính từ gốc.
    const abs = path.resolve(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    (function walk(d) {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.generated.'))
          files.push(p);
      }
    })(abs);
  }
  return files.sort();
}

/** Cây cú pháp + hàm đổi vị trí ký tự sang `file:dòng`. */
export function parseSource(file) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rel = relative(file);
  return {
    source,
    /** Vị trí ký tự → `src/shared/ui/badge/badge.styles.ts:51`. */
    where: (pos) => `${rel}:${String(source.getLineAndCharacterOfPosition(pos).line + 1)}`,
  };
}
