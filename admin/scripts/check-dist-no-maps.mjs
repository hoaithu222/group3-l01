/**
 * Cổng CI (p0-11 OPS-03): bản build production của admin KHÔNG được chứa file source map (`.map`) — ảnh nginx phục vụ công khai, map lộ mã nguồn gốc.
 * Sentry đã nhận map (plugin upload rồi tự xoá, xem `vite.config.ts`); script này chốt chặn cuối trước khi đóng ảnh: còn `.map` nào trong `dist` hoặc bundle còn
 * `sourceMappingURL` trỏ tới map thì báo lỗi (thoát mã 1).
 *
 * Chạy: node scripts/check-dist-no-maps.mjs [thư-mục-dist]   (mặc định `dist`)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(ROOT, process.argv[2] ?? 'dist');

if (!fs.existsSync(dist)) {
  console.error(`[check-dist-no-maps] Không thấy thư mục ${dist} — chạy \`npm run build\` trước.`);
  process.exit(1);
}

const maps = [];
const referencing = [];

(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.map')) {
      maps.push(path.relative(dist, full));
    } else if (/\.(js|mjs|css)$/.test(entry.name)) {
      // Chỉ đọc đuôi file: chú thích `sourceMappingURL` luôn nằm ở dòng cuối.
      const tail = fs.readFileSync(full, 'utf8').slice(-400);
      if (/sourceMappingURL=/.test(tail)) referencing.push(path.relative(dist, full));
    }
  }
})(dist);

if (maps.length === 0 && referencing.length === 0) {
  console.log('[check-dist-no-maps] OK — dist không có source map.');
  process.exit(0);
}
for (const file of maps) console.error(`[check-dist-no-maps] còn file map: ${file}`);
for (const file of referencing) console.error(`[check-dist-no-maps] bundle còn sourceMappingURL: ${file}`);
process.exit(1);
