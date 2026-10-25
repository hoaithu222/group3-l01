import fs from 'node:fs';
import path from 'node:path';

// Jest chạy từ thư mục gốc package `app/` (`rootDir`); `__dirname` bị ESLint cấm ngoài `tests/` gốc.
const ROOT = process.cwd();
const SCAN_DIRS = [path.join('src', 'features', 'o2o'), path.join('app', '(app)', 'me', 'o2o')];
const NATIVE_FILE = path.join('src', 'features', 'o2o', 'utils', 'native-modules.ts');

/**
 * ⛔ `@rnmapbox/maps` và `expo-location` CHỈ được nạp lười qua `utils/native-modules.ts` (`require` trong try/catch) — KHÔNG import tĩnh ở file nguồn nào của
 * feature. Vì sao là test quét file chứ không chỉ test hành vi: Expo Router nạp MỌI file route lúc khởi động, kéo theo mọi thứ chúng import tĩnh; bản dev
 * client dựng TRƯỚC 2026-09-26 thiếu hai module native này nên import tĩnh NÉM LỖI ⇒ cả app đỏ màn NGAY LÚC MỞ (`docs/native-libraries.md`). `tsc`, ESLint và
 * mọi test có mock đều xanh trong khi máy thật chưa build lại thì chết — nên phải chặn ở mức nguồn. `import type` thì được (xoá lúc biên dịch).
 */
const STATIC =
  /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+['"](?:@rnmapbox\/maps|expo-location)['"]|^\s*import\s+['"](?:@rnmapbox\/maps|expo-location)['"]/m;
const REQUIRE = /\brequire\(\s*['"](?:@rnmapbox\/maps|expo-location)['"]\s*\)/;

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : sources(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const relative = (file: string) => path.relative(ROOT, file);

describe('@rnmapbox/maps và expo-location chỉ nạp lười', () => {
  it('không file nguồn nào (feature + route) import tĩnh hai module native', () => {
    const offenders = SCAN_DIRS.flatMap((dir) => sources(path.join(ROOT, dir)))
      .filter((file) => STATIC.test(withoutComments(fs.readFileSync(file, 'utf8'))))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it('`require` hai module native chỉ nằm trong utils/native-modules.ts', () => {
    const offenders = SCAN_DIRS.flatMap((dir) => sources(path.join(ROOT, dir)))
      .filter((file) => relative(file) !== NATIVE_FILE)
      .filter((file) => REQUIRE.test(withoutComments(fs.readFileSync(file, 'utf8'))))
      .map(relative);
    expect(offenders).toEqual([]);
  });

  it('bộ dò hoạt động: bắt import tĩnh, bỏ qua `import type`, chú thích và require lười', () => {
    const hit = (source: string) => STATIC.test(withoutComments(source));
    expect(hit("import Mapbox from '@rnmapbox/maps';")).toBe(true);
    expect(hit("import { MapView } from '@rnmapbox/maps';")).toBe(true);
    expect(hit("import * as Location from 'expo-location';")).toBe(true);
    expect(hit("import 'expo-location';")).toBe(true);
    expect(hit("export { MapView } from '@rnmapbox/maps';")).toBe(true);
    expect(hit("import type * as MapboxNs from '@rnmapbox/maps';")).toBe(false);
    expect(hit("import type { Camera } from '@rnmapbox/maps';")).toBe(false);
    expect(hit("// import Mapbox from '@rnmapbox/maps';")).toBe(false);
    expect(hit("const m = require('@rnmapbox/maps');")).toBe(false);
  });
});

describe('nạp lười (native-modules.ts)', () => {
  // ⚠️ Test "có module" chạy TRƯỚC: test "thiếu module" bên dưới `doMock` cho module ném lỗi và mock đó KHÔNG tự gỡ (`dontMock` sẽ gỡ luôn cả
  // mock toàn cục của `jest.setup.js` nên không dùng) — nó là test cuối của file.
  it('có module (mock toàn cục của repo) → trả module dùng được', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- cần nạp lại module trong vùng cô lập
      const { loadLocationModule, loadMapboxModule } = require('../utils/native-modules');
      expect(loadMapboxModule()?.setAccessToken).toEqual(expect.any(Function));
      expect(loadLocationModule()?.requestForegroundPermissionsAsync).toEqual(expect.any(Function));
    });
  });

  describe('getMapSupport — ba trạng thái quyết định có dựng bản đồ hay chỉ hiện danh sách', () => {
    function support(token: string): string {
      let result = '';
      jest.doMock('@/core/config/env.config', () => ({ appConfig: { mapboxToken: token } }));
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- nạp lại module SAU khi doMock cấu hình
        result = require('../hooks/useMapSupport').getMapSupport();
      });
      return result;
    }

    it('thiếu token → no-token (Mapbox không có token chỉ ra nền trắng, nên không dựng)', () => {
      expect(support('')).toBe('no-token');
    });

    it('có token + module native → ready', () => {
      expect(support('pk.test-token')).toBe('ready');
    });
  });

  it('THIẾU module native (bản dev client cũ): require ném lỗi lúc nạp → trả null, KHÔNG ném — màn rơi về chế độ danh sách', () => {
    jest.doMock('@rnmapbox/maps', () => {
      throw new Error("Cannot find native module 'RNMBXModule'");
    });
    jest.doMock('expo-location', () => {
      throw new Error("Cannot find native module 'ExpoLocation'");
    });
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- cần nạp lại module SAU khi doMock
      const { loadLocationModule, loadMapboxModule } = require('../utils/native-modules');
      expect(loadMapboxModule()).toBeNull();
      expect(loadLocationModule()).toBeNull();
    });
  });

  it('có token nhưng THIẾU module native → unsupported (rơi về danh sách, không sập)', () => {
    jest.doMock('@/core/config/env.config', () => ({
      appConfig: { mapboxToken: 'pk.test-token' },
    }));
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- nạp lại SAU khi doMock (mock '@rnmapbox/maps' ném lỗi còn hiệu lực từ test trước)
      expect(require('../hooks/useMapSupport').getMapSupport()).toBe('unsupported');
    });
  });
});
