import fs from 'node:fs';
import path from 'node:path';

import { PATHS } from '@/shell/config';

const ROOT = path.join(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');

describe('Cây route Expo Router', () => {
  /**
   * ⛔ Test này chặn một lỗi ĐÃ XẢY RA THẬT trong lúc dựng base (2026-09-08).
   *
   * Expo Router tự dò thư mục route và nó ưu tiên `src/app` HƠN `app` ở gốc.
   * Base này để vỏ ứng dụng (provider, store, điều hướng, phiên) ở `src/shell`
   * chính vì lý do đó. Nếu ai đó tạo lại `src/app/` — vì quen tay từ base web
   * `base-projects`, nơi `src/app` LÀ vỏ ứng dụng — thì Expo Router lặng lẽ
   * chuyển sang coi thư mục đó là cây route:
   *
   *   · toàn bộ `app/` ở gốc bị BỎ QUA, không màn hình nào còn tồn tại;
   *   · mỗi file trong `src/app/` thành một "route" (kể cả `store/types.ts`);
   *   · build vẫn XANH, không cảnh báo nào, app chỉ hiện một màn trống.
   *
   * Dấu hiệu duy nhất là một dòng log dễ trôi qua: "Using src/app as the root
   * directory for Expo Router".
   */
  it('không có src/app — thư mục đó sẽ CƯỚP quyền làm cây route của app/', () => {
    const collidingDir = path.join(ROOT, 'src', 'app');
    expect(fs.existsSync(collidingDir)).toBe(false);
  });

  it('app/ ở gốc tồn tại và có layout gốc', () => {
    expect(fs.existsSync(path.join(APP_DIR, '_layout.tsx'))).toBe(true);
  });
});

describe('PATHS khớp với file route', () => {
  /**
   * ⛔ Cái bẫy này đã sập một lần ở base web: `PATHS.PROFILE` được khai và menu
   * điều hướng tới, nhưng KHÔNG route nào mount nó — bấm vào rơi thẳng vào
   * catch-all và ra màn 404. `tsc` không thấy (chuỗi vẫn hợp lệ), lint cũng không.
   *
   * Đối chiếu hai danh sách để thêm một đường dẫn mà quên tạo file là test đỏ ngay.
   */
  const routeFiles = new Set<string>();

  const collect = (dir: string, prefix = ''): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        // Nhóm route `(ten)` KHÔNG xuất hiện trong đường dẫn — bỏ khỏi tiền tố.
        const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')');
        collect(path.join(dir, entry.name), isGroup ? prefix : `${prefix}/${entry.name}`);
        continue;
      }
      if (!entry.name.endsWith('.tsx')) continue;
      if (entry.name.startsWith('_') || entry.name.startsWith('+')) continue;

      const base = entry.name.replace(/\.tsx$/, '');
      routeFiles.add(base === 'index' ? prefix || '/' : `${prefix}/${base}`);
    }
  };

  beforeAll(() => collect(APP_DIR));

  it.each(Object.entries(PATHS))('PATHS.%s = "%s" có file route tương ứng', (_name, value) => {
    expect(routeFiles).toContain(value);
  });
});
