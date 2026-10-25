/**
 * Sinh kiểu route (typed routes) cho cổng `npm run typecheck` — vào thư mục RIÊNG, ngoài `.expo/`.
 *
 * ── Vì sao không dùng thẳng `.expo/types/router.d.ts` ─────────────────────────────────────────────
 * `experiments.typedRoutes` do Metro (lúc `expo start` chạy) ghi `.expo/types/router.d.ts`, và bộ theo dõi
 * file của nó (`@expo/router-server` → `typed-routes/index.js#getWatchHandler`) kiểm "file nằm ngoài
 * `app/app/` thì bỏ" bằng `path.relative(...).startsWith('../')`. Trên Windows `path.relative` trả
 * `..\src\…` (dấu `\`) ⇒ phép kiểm KHÔNG BAO GIỜ khớp ⇒ mọi file `.ts/.tsx` thêm/sửa trong `src/`, `tests/`
 * khi Metro đang chạy đều bị coi là "route" và ghi rác `/../src/**`, `/../tests/**` vào union `href`
 * (hàng trăm phần tử) ⇒ `TS2590: Expression produces a union type that is too complex to represent` ở
 * mọi chỗ dùng `Href` (`DeepLinkRedirect.tsx`, `intent-handlers.ts`…). Đó KHÔNG phải lỗi mã: cùng mã, sinh
 * lại sạch thì `tsc` 0 lỗi. Cùng lỗi tách đường dẫn làm sự kiện `delete` không xoá route cũ.
 * Linux (CI) không dính vì `path.relative` ra `../`.
 *
 * Sinh lại `.expo/types` không cứu được: Metro ghi đè ở lần thêm/sửa file kế tiếp. Nên cổng kiểm KHÔNG đọc
 * `.expo/types` nữa: script này dựng bảng route THẲNG TỪ ĐĨA (cùng bộ sinh của Expo, cùng bộ lọc file) rồi
 * ghi vào `.typecheck/` — Metro không biết thư mục này nên không ghi đè được. `tsconfig.typecheck.json`
 * trỏ vào đó; `tsconfig.json` (editor/Metro) giữ nguyên `.expo/types`.
 *
 * ⚠️ Cũng ghi `.typecheck/expo-env.d.ts` (`/// <reference types="expo/types" />`) để cổng kiểm không phụ
 * thuộc `expo-env.d.ts` ở gốc — file đó do `expo start` sinh, không có trên CI sạch.
 *
 * Chạy: `node scripts/typed-routes.mjs` (tự chạy trong `npm run typecheck`). Thêm/đổi tên/xoá file route thì
 * chạy lại — `npm run typecheck` đã làm sẵn nên không cần nhớ.
 * Thoát 0 kể cả khi cây route lỗi? KHÔNG: lỗi bộ sinh làm script thoát 1 (đừng để `tsc` chạy với bảng route rỗng).
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_ROOT = path.join(ROOT, 'app');
const OUT_DIR = path.join(ROOT, '.typecheck');

const require = createRequire(import.meta.url);

/**
 * `@expo/router-server` nằm lồng trong `expo/node_modules/@expo/cli/node_modules/` (đường lồng đổi theo cách
 * npm phẳng hoá cây phụ thuộc) ⇒ đi từ `expo` → `@expo/cli` → `@expo/router-server` bằng `createRequire` ở từng
 * bậc, không đoán đường dẫn cứng.
 */
function resolveGenerator() {
  const expoPkg = require.resolve('expo/package.json');
  const cliPkg = createRequire(expoPkg).resolve('@expo/cli/package.json');
  const routerServerPkg = createRequire(cliPkg).resolve('@expo/router-server/package.json');
  return path.join(path.dirname(routerServerPkg), 'build', 'typed-routes', 'generate.js');
}

/** Ghi file CHỈ khi nội dung đổi — giữ mtime, đỡ đánh thức bộ theo dõi file của editor. */
function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.writeFileSync(file, content);
  return true;
}

function main() {
  if (!fs.existsSync(APP_ROOT)) {
    console.error(`typed-routes: không thấy thư mục route ${APP_ROOT}`);
    process.exit(1);
  }

  const requireContext = require('expo-router/internal/testing').requireContext;
  const { EXPO_ROUTER_CTX_IGNORE } = require('expo-router/_ctx-shared');
  const { getTypedRoutesDeclarationFile } = require(resolveGenerator());

  // ⛔ Chỉ quét `app/app/` — đúng thư mục route, KHÔNG phải cả dự án (đó chính là lỗi của bộ theo dõi Metro).
  const ctx = requireContext(APP_ROOT, true, EXPO_ROUTER_CTX_IGNORE);
  const routeFiles = ctx.keys();
  if (routeFiles.length === 0) {
    console.error('typed-routes: không tìm thấy file route nào trong app/app/');
    process.exit(1);
  }

  const declaration = getTypedRoutesDeclarationFile(ctx, {});
  if (!declaration) {
    console.error('typed-routes: bộ sinh của Expo không trả về khai báo');
    process.exit(1);
  }

  // Rào chắn: bảng route sạch không thể chứa đường dẫn trèo ra ngoài `app/app/`.
  if (declaration.includes('`/../')) {
    console.error(
      'typed-routes: khai báo sinh ra còn đường dẫn `/../…` (file ngoài app/app/ lọt vào)',
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const wroteRoutes = writeIfChanged(path.join(OUT_DIR, 'router.d.ts'), declaration);
  writeIfChanged(
    path.join(OUT_DIR, 'expo-env.d.ts'),
    '/// <reference types="expo/types" />\n\n// Sinh bởi scripts/typed-routes.mjs — KHÔNG sửa, không commit (thư mục .typecheck/ nằm trong .gitignore).\n',
  );
  console.log(
    `typed-routes: ${routeFiles.length} file trong app/app/ -> .typecheck/router.d.ts (${wroteRoutes ? 'đã ghi' : 'không đổi'})`,
  );
}

main();
