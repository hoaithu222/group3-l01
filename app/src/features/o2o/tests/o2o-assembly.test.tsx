import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import fs from 'node:fs';
import path from 'node:path';

import { useFeature } from '@/shell/capabilities';
import { MODULE_REGISTRY } from '@/shell/navigation/module-registry';

import { O2oMeRow } from '../components/O2oMeRow';

/**
 * Nơi LẮP RÁP p6-05 vào vỏ ứng dụng — lỗi ở đây "im lặng" (tsc/eslint xanh, tính năng chỉ không xuất hiện hoặc thành TAB thừa), nên khoá bằng đọc thẳng file:
 *  · route nằm dưới `me/o2o/` (KHÔNG phải `(app)/o2o/`: thư mục mới cấp `(app)/` bị Expo Router tự dựng thành TAB) và có `_layout.tsx` riêng;
 *  · `me/_layout.tsx` import `o2o/register-profile` (chỉ có tác dụng phụ — không ai import thì hàng ở màn Tôi không bao giờ hiện);
 *  · phân hệ đăng ký `menu` (không tab), có cờ `o2o`, không `name` (không có route cấp `(app)/`).
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));

const ROOT = process.cwd();
const read = (...segments: string[]) => fs.readFileSync(path.join(ROOT, ...segments), 'utf8');
const exists = (...segments: string[]) => fs.existsSync(path.join(ROOT, ...segments));
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('p6-05 — cây route', () => {
  it('route dưới `me/o2o/` với `_layout.tsx` riêng; KHÔNG có thư mục `(app)/o2o/` (sẽ thành tab)', () => {
    expect(exists('app', '(app)', 'o2o')).toBe(false);
    for (const file of [
      '_layout.tsx',
      'map.tsx',
      'locations/[locationId].tsx',
      'orders.tsx',
      'print/new.tsx',
      'print/[orderId].tsx',
    ]) {
      expect({ file, ok: exists('app', '(app)', 'me', 'o2o', ...file.split('/')) }).toEqual({
        file,
        ok: true,
      });
    }
  });

  it('layout của nhánh: cờ `o2o` chặn cả nhánh + trình nghe socket gắn MỘT lần', () => {
    const layout = stripComments(read('app', '(app)', 'me', 'o2o', '_layout.tsx'));

    expect(layout).toContain('<FeatureRouteGuard flag="o2o">');
    expect(layout.match(/usePrintOrderSocket\(\)/g)).toHaveLength(1);
  });

  it('me/_layout.tsx import register-profile của o2o (hàng "Địa điểm & in ấn" ở màn Tôi)', () => {
    expect(stripComments(read('app', '(app)', 'me', '_layout.tsx'))).toContain(
      "import '@/features/o2o/register-profile';",
    );
  });

  it('file route giữ MỎNG: chỉ import + return (nội dung nằm ở features/o2o/screens)', () => {
    for (const file of [
      'map.tsx',
      'locations/[locationId].tsx',
      'orders.tsx',
      'print/new.tsx',
      'print/[orderId].tsx',
    ]) {
      const code = read('app', '(app)', 'me', 'o2o', ...file.split('/'));
      expect(code).toMatch(/from '@\/features\/o2o\/screens\/\w+'/);
      expect(code.split('\n').length).toBeLessThan(10);
    }
  });
});

describe('p6-05 — đăng ký phân hệ', () => {
  it('mục `o2o`: phân hệ PHỤ (không tab), cờ `o2o`, href vào bản đồ, không `name`', () => {
    const entry = MODULE_REGISTRY.find((module) => module.id === 'o2o');

    expect(entry).toMatchObject({
      placement: 'menu',
      href: '/me/o2o/map',
      featureFlag: 'o2o',
      title: 'Địa điểm & in ấn',
    });
    expect(entry).not.toHaveProperty('name');
    expect(MODULE_REGISTRY.filter((module) => module.placement === 'bar')).toHaveLength(4);
  });
});

describe('O2oMeRow — hàng ở màn Tôi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cờ `o2o` bật → có hàng, bấm mở bản đồ', async () => {
    jest.mocked(useFeature).mockReturnValue(true);
    await render(<O2oMeRow />);

    await fireEvent.press(screen.getByText('Địa điểm & in ấn'));
    expect(router.push).toHaveBeenCalledWith('/me/o2o/map');
  });

  it.each([false, undefined])(
    'cờ %s (tắt hoặc chưa tải) → KHÔNG hiện, không lộ phân hệ chưa bật',
    async (flag) => {
      jest.mocked(useFeature).mockReturnValue(flag);
      await render(<O2oMeRow />);

      expect(screen.queryByText('Địa điểm & in ấn')).toBeNull();
    },
  );
});
