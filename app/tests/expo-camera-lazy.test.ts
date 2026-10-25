import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');

/**
 * ⛔ `expo-camera` chỉ được nạp bằng `import('expo-camera')` (động, bắt được lỗi) — KHÔNG import tĩnh ở bất kỳ file
 * nguồn nào.
 *
 * Vì sao là test quét file chứ không chỉ test hành vi: Expo Router nạp MỌI file route lúc khởi động, kéo theo mọi thứ
 * chúng import tĩnh. `expo-camera` khi nạp gọi `requireNativeModule('ExpoCamera')` và NÉM LỖI nếu bản dev client chưa
 * build lại với plugin `expo-camera` ⇒ app đỏ màn NGAY LÚC MỞ, kể cả người không bao giờ vào màn quét QR. `tsc`, ESLint
 * và mọi test có mock `expo-camera` đều xanh trong khi máy thật chưa build lại thì chết — nên phải chặn ở mức nguồn.
 * (Một `import type` cũng bị chặn: kiểu module suy từ `import()` là đủ — xem `useCameraModule`.)
 */
const STATIC_IMPORT = /\bfrom\s+['"]expo-camera['"]|\brequire\(\s*['"]expo-camera['"]\s*\)|\bimport\s+['"]expo-camera['"]/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** Bỏ chú thích: nhắc tới `from 'expo-camera'` để GIẢI THÍCH vì sao cấm thì không phải là import. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('expo-camera chỉ nạp động', () => {
  it('không file nguồn nào (src/, app/) import tĩnh expo-camera', () => {
    const offenders = ['src', 'app']
      .flatMap((dir) => sourceFiles(path.join(ROOT, dir)))
      .filter((file) => STATIC_IMPORT.test(withoutComments(fs.readFileSync(file, 'utf8'))))
      .map((file) => path.relative(ROOT, file).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });

  it('bộ dò hoạt động: bắt import tĩnh, bỏ qua chú thích và import() động', () => {
    const hit = (source: string) => STATIC_IMPORT.test(withoutComments(source));

    expect(hit("import { CameraView } from 'expo-camera';")).toBe(true);
    expect(hit('import type { CameraType } from "expo-camera";')).toBe(true);
    expect(hit("const { CameraView } = require('expo-camera');")).toBe(true);
    expect(hit("import 'expo-camera';")).toBe(true);
    expect(hit("// import { CameraView } from 'expo-camera';")).toBe(false);
    expect(hit("/* import { CameraView } from 'expo-camera'; */")).toBe(false);
    expect(hit("const load = () => import('expo-camera');")).toBe(false);
  });
});
