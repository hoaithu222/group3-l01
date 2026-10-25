import fs from 'node:fs';
import path from 'node:path';

import {
  NOT_USER_DATA_STORES,
  PERSISTENCE_POLICY,
  WIPE_COVERAGE,
} from '@/shell/session/user-scoped-stores.constants';

/**
 * KHOÁ danh sách "mọi store dữ liệu người dùng phải được dọn khi rời phiên".
 *
 * Quét THẬT cây `src/` — không phải danh sách viết tay — nên một store mới (file dùng `zustand`,
 * hoặc file ghi bền `AsyncStorage`/kho khoá) mà chưa được khai trong `user-scoped-stores.constants.ts`
 * là test ĐỎ ngay. ⛔ Cách xử lý đúng: thêm bước dọn vào `wipe-steps.ts` + `WIPE_COVERAGE`, hoặc
 * (chỉ khi store thật sự KHÔNG chứa dữ liệu người dùng) ghi lý do vào `NOT_USER_DATA_STORES`.
 * Đừng sửa test này cho qua.
 */

const APP_ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(APP_ROOT, 'src');

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(APP_ROOT, file).split(path.sep).join('/');
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const FILES = listSourceFiles(SRC).map((file) => ({
  code: stripComments(fs.readFileSync(file, 'utf8')),
  path: rel(file),
}));

const ZUSTAND_STORES = FILES.filter((f) => /from 'zustand'/.test(f.code)).map((f) => f.path);

const PERSISTENCE_CALL =
  /\b(?:readJson|writeJson|removeKey|readSecure|writeSecure|deleteSecure)\s*\(|AsyncStorage\.|createPersistStorage\s*\(|SecureStore\.(?:get|set|delete)ItemAsync/;
/** `core/storage` LÀ hạ tầng ghi bền — chính nó không phải "nơi lưu dữ liệu". */
const PERSISTENCE_FILES = FILES.filter(
  (f) => !f.path.startsWith('src/core/storage/') && PERSISTENCE_CALL.test(f.code),
).map((f) => f.path);

const COVERED = new Set(Object.values(WIPE_COVERAGE).flat());

describe('store zustand', () => {
  it('MỌI file store đều được phân loại: dọn khi rời phiên, hoặc ghi lý do không phải dữ liệu người dùng', () => {
    const unclassified = ZUSTAND_STORES.filter(
      (file) => !COVERED.has(file) && !(file in NOT_USER_DATA_STORES),
    );

    expect(unclassified).toEqual([]);
  });

  it('không khai file không còn tồn tại / không phải store (sổ không được mục dần)', () => {
    const known = [...COVERED, ...Object.keys(NOT_USER_DATA_STORES)];
    const stale = known.filter((file) => !ZUSTAND_STORES.includes(file));

    expect(stale).toEqual([]);
  });

  it('một store không khai ở cả hai nhóm', () => {
    const both = Object.keys(NOT_USER_DATA_STORES).filter((file) => COVERED.has(file));

    expect(both).toEqual([]);
  });

  it('mọi lý do "không phải dữ liệu người dùng" đều được viết ra', () => {
    for (const [file, why] of Object.entries(NOT_USER_DATA_STORES)) {
      expect({ file, ok: why.trim().length > 20 }).toEqual({ file, ok: true });
    }
  });
});

describe('lưu bền ngoài zustand (AsyncStorage / kho khoá)', () => {
  it('MỌI file ghi bền đều có chính sách khi rời phiên', () => {
    const unclassified = PERSISTENCE_FILES.filter((file) => !(file in PERSISTENCE_POLICY));

    expect(unclassified).toEqual([]);
  });

  it('không khai chính sách cho file không còn ghi bền', () => {
    const stale = Object.keys(PERSISTENCE_POLICY).filter(
      (file) => !PERSISTENCE_FILES.includes(file),
    );

    expect(stale).toEqual([]);
  });
});
