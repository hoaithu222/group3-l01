import fs from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react-native';

import { resolvePushHref } from '@/core/notifications';
import { ProfileRowsSlot, resetProfileRows } from '@/shared/profile';
import { useFeature } from '@/shell/capabilities';

import '../register-profile';

/**
 * LẮP RÁP p7-03 vào vỏ ứng dụng — lỗi ở đây "im lặng" (tsc/eslint xanh, tính năng chỉ không xuất hiện hoặc thành TAB thừa), nên khoá bằng đọc thẳng file:
 *  · route nằm dưới `me/wellbeing/` (KHÔNG phải `(app)/wellbeing/`: thư mục mới cấp `(app)/` bị Expo Router tự dựng thành TAB) và có `_layout.tsx` riêng;
 *  · layout gắn hàng rào cờ; file route mỏng; `me/_layout.tsx` import `register-profile`; `(app)/_layout.tsx` mount `WellbeingAlertHost` ĐÚNG MỘT lần;
 *  · chạm thông báo `wellbeing.alert` mở màn Sức khoẻ.
 * Và QUYỀN RIÊNG TƯ bằng quét mã: feature KHÔNG ghi bền, KHÔNG log, KHÔNG giữ điểm số.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));

const ROOT = process.cwd();
const read = (...segments: string[]) => fs.readFileSync(path.join(ROOT, ...segments), 'utf8');
const exists = (...segments: string[]) => fs.existsSync(path.join(ROOT, ...segments));
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('p7-03 — cây route và lắp ráp', () => {
  it('route dưới `me/wellbeing/` với `_layout.tsx` riêng; KHÔNG có `(app)/wellbeing/` (sẽ thành tab)', () => {
    expect(exists('app', '(app)', 'wellbeing')).toBe(false);
    for (const file of ['_layout.tsx', 'index.tsx', 'onboarding.tsx', 'settings.tsx']) {
      expect({ file, ok: exists('app', '(app)', 'me', 'wellbeing', file) }).toEqual({
        file,
        ok: true,
      });
    }
  });

  it('layout: hàng rào cờ `burnout` bọc Stack (không dùng FeatureRouteGuard: màn tắt phải còn nút rút lại)', () => {
    const layout = stripComments(read('app', '(app)', 'me', 'wellbeing', '_layout.tsx'));

    expect(layout).toContain('<WellbeingRouteGate>');
    expect(layout).toContain('<Stack');
    expect(layout).not.toContain('FeatureRouteGuard');
  });

  it('file route giữ MỎNG: chỉ import + return', () => {
    for (const file of ['index.tsx', 'onboarding.tsx', 'settings.tsx']) {
      const code = read('app', '(app)', 'me', 'wellbeing', file);
      expect(code).toMatch(/from '@\/features\/wellbeing'/);
      expect(code.split('\n').length).toBeLessThan(10);
    }
  });

  it('`me/_layout.tsx` import register-profile; `(app)/_layout.tsx` mount WellbeingAlertHost đúng MỘT lần', () => {
    expect(stripComments(read('app', '(app)', 'me', '_layout.tsx'))).toContain(
      "import '@/features/wellbeing/register-profile';",
    );
    const appLayout = stripComments(read('app', '(app)', '_layout.tsx'));
    expect(appLayout.match(/<WellbeingAlertHost \/>/g)).toHaveLength(1);
    expect(appLayout).toContain("from '@/features/wellbeing'");
  });

  it('register-profile đăng ký hàng "Sức khoẻ học tập" vào khe của màn Tôi', async () => {
    jest.mocked(useFeature).mockReturnValue(true);
    await render(<ProfileRowsSlot />);
    expect(screen.getByText('Sức khoẻ học tập')).toBeOnTheScreen();
    resetProfileRows();
  });

  it('chạm push/hộp thư `wellbeing.alert` ⇒ màn Sức khoẻ (push trung tính, không mang mức/điểm)', () => {
    expect(resolvePushHref({ targetUserId: 'u1', type: 'wellbeing.alert' })).toBe('/me/wellbeing');
  });
});

describe('p7-03 — quyền riêng tư của mã nguồn', () => {
  const files = sourceFiles(path.join(ROOT, 'src', 'features', 'wellbeing')).map((file) => ({
    code: stripComments(fs.readFileSync(file, 'utf8')),
    name: path.relative(ROOT, file).split(path.sep).join('/'),
  }));

  it('không ghi bền dữ liệu đánh giá: không zustand, AsyncStorage, kho khoá, `core/storage`', () => {
    const offenders = files.filter((f) =>
      /from 'zustand'|AsyncStorage|SecureStore|core\/storage|readJson|writeJson|createPersistStorage|persistQueryClient/.test(
        f.code,
      ),
    );
    expect(offenders.map((f) => f.name)).toEqual([]);
  });

  it('không log nội dung: không console.*, không logger', () => {
    const offenders = files.filter((f) => /\bconsole\.|utils\/logger|logger\./.test(f.code));
    expect(offenders.map((f) => f.name)).toEqual([]);
  });

  it('không giữ/hiện điểm số: không `riskScore`, không `points` trong mã (chỉ trong chú thích)', () => {
    const offenders = files.filter((f) => /riskScore|\bpoints\b/.test(f.code));
    expect(offenders.map((f) => f.name)).toEqual([]);
  });
});
