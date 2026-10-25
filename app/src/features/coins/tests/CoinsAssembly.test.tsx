import fs from 'node:fs';
import path from 'node:path';

/**
 * LẮP RÁP p7-02 vào vỏ ứng dụng — lỗi ở đây "im lặng" (tsc/eslint xanh, tính năng chỉ không xuất hiện hoặc thành TAB thừa), nên khoá bằng đọc thẳng file:
 *  · route nằm dưới `me/coins/` (KHÔNG phải `(app)/coins/`: thư mục mới cấp `(app)/` bị Expo Router tự dựng thành TAB) và có `_layout.tsx` riêng;
 *  · layout gắn cờ `coins` + trình nghe socket MỘT lần; file route mỏng;
 *  · `me/_layout.tsx` import `coins/register-profile`; `shell/home-widgets/register-stats-widgets.ts` import `coins/register-home-widgets` (chỉ có tác dụng phụ).
 * (Hành vi hàng ở màn Tôi, widget Trang chủ, tắt cờ ⇒ ẩn hoàn toàn: `CoinsEntry.test.tsx`.)
 */

const ROOT = process.cwd();
const read = (...segments: string[]) => fs.readFileSync(path.join(ROOT, ...segments), 'utf8');
const exists = (...segments: string[]) => fs.existsSync(path.join(ROOT, ...segments));
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('p7-02 — cây route và lắp ráp', () => {
  it('route dưới `me/coins/` với `_layout.tsx` riêng; KHÔNG có thư mục `(app)/coins/` (sẽ thành tab)', () => {
    expect(exists('app', '(app)', 'coins')).toBe(false);
    for (const file of ['_layout.tsx', 'index.tsx', 'shop.tsx', 'inventory.tsx']) {
      expect({ file, ok: exists('app', '(app)', 'me', 'coins', file) }).toEqual({ file, ok: true });
    }
  });

  it('layout của nhánh: cờ `coins` chặn cả nhánh + trình nghe socket gắn MỘT lần', () => {
    const layout = stripComments(read('app', '(app)', 'me', 'coins', '_layout.tsx'));

    expect(layout).toContain('<FeatureRouteGuard flag="coins">');
    expect(layout.match(/useCoinsEvents\(\)/g)).toHaveLength(1);
  });

  it('file route giữ MỎNG: chỉ import + return (nội dung ở features/coins/screens)', () => {
    for (const file of ['index.tsx', 'shop.tsx', 'inventory.tsx']) {
      const code = read('app', '(app)', 'me', 'coins', file);
      expect(code).toMatch(/from '@\/features\/coins'/);
      expect(code.split('\n').length).toBeLessThan(10);
    }
  });

  it('nơi lắp ráp import register-profile (màn Tôi) và register-home-widgets (Trang chủ)', () => {
    expect(stripComments(read('app', '(app)', 'me', '_layout.tsx'))).toContain(
      "import '@/features/coins/register-profile';",
    );
    expect(
      stripComments(read('src', 'shell', 'home-widgets', 'register-stats-widgets.ts')),
    ).toContain("import '@/features/coins/register-home-widgets';");
  });
});
