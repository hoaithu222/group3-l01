import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Test cho cổng `typecheck` không phụ thuộc Metro: `scripts/typed-routes.mjs` + `tsconfig.typecheck.json`.
 *
 * ── Vì sao cần ───────────────────────────────────────────────────────────────
 * Trên Windows, Metro đang chạy ghi rác `/../src/**` vào `.expo/types/router.d.ts` ⇒ TS2590 giả ở mọi chỗ
 * dùng `Href` (nguyên nhân + đo đạc: chú thích đầu `scripts/typed-routes.mjs`). Cổng kiểm chỉ tin được
 * nếu (1) nó đọc bảng route dựng từ đĩa, (2) không đọc `.expo/types` — hai điều rất dễ hỏng ÂM THẦM khi ai
 * đó "dọn" tsconfig hay đổi script: `tsc` vẫn xanh, chỉ là lại đỏ giả (hoặc xanh giả) ở máy có Metro.
 */
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, '.typecheck');

function readJsonWithComments(file: string): { extends?: string; include?: string[] } {
  // `tsconfig` cho phép chú thích `//` — bỏ chúng (chỉ ở đầu dòng, không đụng chuỗi chứa `//`).
  const text = fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(text) as { extends?: string; include?: string[] };
}

describe('scripts/typed-routes.mjs', () => {
  let result: ReturnType<typeof spawnSync>;
  let declaration = '';

  beforeAll(() => {
    result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'typed-routes.mjs')], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    declaration = fs.existsSync(path.join(OUT, 'router.d.ts'))
      ? fs.readFileSync(path.join(OUT, 'router.d.ts'), 'utf8')
      : '';
  });

  it('chạy được và thoát 0', () => {
    expect(result.status).toBe(0);
  });

  it('ghi bảng route vào .typecheck/ — thư mục ngoài .expo nên Metro không ghi đè được', () => {
    expect(declaration).toContain('hrefInputParams');
    expect(declaration).toContain("declare module 'expo-router'");
    expect(fs.readFileSync(path.join(OUT, 'expo-env.d.ts'), 'utf8')).toContain('expo/types');
  });

  it('KHÔNG có đường dẫn trèo ra ngoài app/app/ (rác `/../src/**` của Metro trên Windows)', () => {
    expect(declaration).not.toContain('`/../');
  });

  it('có cả route tĩnh lẫn route động của cây app/app/', () => {
    // Route động `[param]` sinh phần tử có `params` bắt buộc; route tĩnh sinh phần tử `params?`.
    expect(declaration).toMatch(/pathname: `\/[^`]*`; params\?: Router\.UnknownInputParams;/);
    expect(declaration).toMatch(
      /pathname: `\/[^`]*\[[^\]]+\][^`]*`, params: Router\.UnknownInputParams & \{/,
    );
  });
});

describe('tsconfig.typecheck.json + script typecheck', () => {
  const config = readJsonWithComments(path.join(ROOT, 'tsconfig.typecheck.json'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };

  it('kế thừa tsconfig.json và đọc kiểu route từ .typecheck/', () => {
    expect(config.extends).toBe('./tsconfig.json');
    expect(config.include).toContain('.typecheck/**/*.d.ts');
  });

  it('⛔ KHÔNG nạp .expo/types — hai bảng route cùng khai ExpoRouter.__routes sẽ TS2717', () => {
    expect((config.include ?? []).some((pattern) => pattern.includes('.expo'))).toBe(false);
  });

  it('script typecheck sinh bảng route rồi chạy tsc với tsconfig.typecheck.json', () => {
    expect(pkg.scripts.typecheck).toContain('scripts/typed-routes.mjs');
    expect(pkg.scripts.typecheck).toContain('tsconfig.typecheck.json');
  });
});
