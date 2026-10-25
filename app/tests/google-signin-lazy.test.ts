import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');

/**
 * ⛔ `@react-native-google-signin/google-signin` và `@react-native-firebase/*` chỉ được nạp bằng `import()` động (qua
 * `src/core/auth/social/load-google-modules.ts`) — KHÔNG import tĩnh ở bất kỳ file nguồn nào.
 *
 * Cùng lý do `expo-camera-lazy.test.ts`: Expo Router nạp MỌI file route lúc khởi động, kéo theo mọi thứ chúng import tĩnh; hai gói này
 * là module NATIVE và NÉM LỖI khi nạp trên bản dev client/APK được build TRƯỚC khi thêm chúng ⇒ app đỏ màn NGAY LÚC MỞ, kể cả người
 * không bao giờ bấm "Tiếp tục với Google". `tsc`, ESLint và mọi test có mock đều xanh trong khi máy chưa build lại thì chết.
 */
const PACKAGES = String.raw`@react-native-google-signin/google-signin|@react-native-firebase/[a-z-]+`;
const STATIC_IMPORT = new RegExp(
  String.raw`\bfrom\s+['"](?:${PACKAGES})['"]|\brequire\(\s*['"](?:${PACKAGES})['"]\s*\)|\bimport\s+['"](?:${PACKAGES})['"]`,
);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** Bỏ chú thích: nhắc tới `from '…'` để GIẢI THÍCH vì sao cấm thì không phải là import. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('Google Sign-In / RNFirebase chỉ nạp động', () => {
  it('không file nguồn nào (src/, app/) import tĩnh hai gói này', () => {
    const offenders = ['src', 'app']
      .flatMap((dir) => sourceFiles(path.join(ROOT, dir)))
      .filter((file) => STATIC_IMPORT.test(withoutComments(fs.readFileSync(file, 'utf8'))))
      .map((file) => path.relative(ROOT, file).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });

  it('bộ dò hoạt động: bắt import tĩnh, bỏ qua chú thích và import() động', () => {
    const hit = (source: string) => STATIC_IMPORT.test(withoutComments(source));

    expect(hit("import { GoogleSignin } from '@react-native-google-signin/google-signin';")).toBe(true);
    expect(hit('import auth from "@react-native-firebase/auth";')).toBe(true);
    expect(hit("const app = require('@react-native-firebase/app');")).toBe(true);
    expect(hit("import '@react-native-firebase/app';")).toBe(true);
    expect(hit("// import auth from '@react-native-firebase/auth';")).toBe(false);
    expect(hit("const load = () => import('@react-native-firebase/auth');")).toBe(false);
  });
});
