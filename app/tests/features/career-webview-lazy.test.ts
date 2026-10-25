import fs from 'node:fs';
import path from 'node:path';

/**
 * ⛔ `react-native-webview` chỉ được nạp bằng `import()` động (`utils/load-webview-module.ts`) — KHÔNG import tĩnh ở file nào của feature `career`. Expo Router nạp MỌI file route lúc khởi động, kéo theo
 * mọi thứ chúng import tĩnh; gói này gọi `TurboModuleRegistry.getEnforcing('RNCWebViewModule')` khi nạp và NÉM LỖI nếu dev client cài trước đợt thêm gói chưa build lại ⇒ app đỏ màn NGAY LÚC MỞ, kể cả người
 * không bao giờ vào màn xem trước (`docs/native-libraries.md` "Nạp lười module native"). `tsc`, ESLint và mọi test (WebView đã có mock toàn cục) đều xanh trong khi máy thật chết — nên chặn ở mức nguồn.
 * Phạm vi quét = feature `career` (của p6-07) — cùng mẫu `tests/expo-camera-lazy.test.ts` (nằm ở `tests/` vì ESLint cấm `__dirname` trong `src/`).
 */
const FEATURE = path.join(__dirname, '..', '..', 'src', 'features', 'career');
const STATIC_IMPORT =
  /\bfrom\s+['"]react-native-webview['"]|\brequire\(\s*['"]react-native-webview['"]\s*\)|\bimport\s+['"]react-native-webview['"]/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** Bỏ chú thích: nhắc tới `from 'react-native-webview'` để GIẢI THÍCH vì sao cấm thì không phải là import. */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('react-native-webview chỉ nạp động ở feature career', () => {
  it('không file nguồn nào import tĩnh (kể cả `import type`)', () => {
    const offenders = sourceFiles(FEATURE)
      .filter((file) => STATIC_IMPORT.test(withoutComments(fs.readFileSync(file, 'utf8'))))
      .map((file) => path.relative(FEATURE, file).replace(/\\/g, '/'));
    expect(offenders).toEqual([]);
  });

  it('có ĐÚNG một chỗ nạp động: utils/load-webview-module.ts', () => {
    const dynamic = sourceFiles(FEATURE)
      .filter((file) =>
        /import\(\s*['"]react-native-webview['"]\s*\)/.test(
          withoutComments(fs.readFileSync(file, 'utf8')),
        ),
      )
      .map((file) => path.relative(FEATURE, file).replace(/\\/g, '/'));
    expect(dynamic).toEqual(['utils/load-webview-module.ts']);
  });

  it('bộ dò hoạt động: bắt import tĩnh, bỏ qua chú thích và import() động', () => {
    const hit = (source: string) => STATIC_IMPORT.test(withoutComments(source));
    expect(hit("import { WebView } from 'react-native-webview';")).toBe(true);
    expect(hit('import type { WebViewProps } from "react-native-webview";')).toBe(true);
    expect(hit("const { WebView } = require('react-native-webview');")).toBe(true);
    expect(hit("// import { WebView } from 'react-native-webview';")).toBe(false);
    expect(hit("const load = () => import('react-native-webview');")).toBe(false);
  });
});
