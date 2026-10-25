import { fireEvent, render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { router } from 'expo-router';

import { PortfolioEntryCard } from '@/features/career/components/portfolio/PortfolioEntryCard';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * app.md p6-07 §1: nơi LẮP RÁP portfolio vào cây route và màn Nghề nghiệp — lỗi ở đây "im lặng" (tsc/eslint xanh, tính năng chỉ không xuất hiện). Thư mục route mới PHẢI có `_layout.tsx` (thiếu thì
 * Expo Router hoist từng file thành route ngang hàng); mỗi route mỏng (chỉ import + return); thẻ "Portfolio" chỉ hiện khi cờ `career` BẬT.
 */
const mockFlag = { current: true as boolean | undefined };
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => mockFlag.current }));

const ROOT = path.join(__dirname, '..', '..');
const ROUTES = path.join(ROOT, 'app', '(app)', 'me', 'career', 'portfolio');
const src = (...parts: string[]) =>
  fs.readFileSync(path.join(ROOT, 'src', 'features', 'career', ...parts), 'utf8');

describe('cây route me/career/portfolio', () => {
  it('có _layout.tsx (Stack, ẩn header) cùng đủ 6 màn theo app.md §1', () => {
    // Stack dùng `screenOptions` CHUNG của app (ẩn header + trượt ngang) — xem `shell/navigation/stack-screen-options.ts`.
    const layout = fs.readFileSync(path.join(ROUTES, '_layout.tsx'), 'utf8');
    expect(layout).toContain(
      "import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';",
    );
    expect(layout).toMatch(/<Stack screenOptions=\{STACK_SCREEN_OPTIONS\} \/>/);
    expect(STACK_SCREEN_OPTIONS.headerShown).toBe(false);
    for (const file of [
      'index.tsx',
      'profile.tsx',
      'appearance.tsx',
      'preview.tsx',
      path.join('projects', 'add.tsx'),
      path.join('projects', '[projectId].tsx'),
    ]) {
      expect(fs.existsSync(path.join(ROUTES, file))).toBe(true);
    }
  });

  it('mỗi route MỎNG: một import từ feature, một component, không hook/logic', () => {
    for (const file of [
      'index.tsx',
      'profile.tsx',
      'appearance.tsx',
      'preview.tsx',
      path.join('projects', 'add.tsx'),
      path.join('projects', '[projectId].tsx'),
    ]) {
      const code = fs
        .readFileSync(path.join(ROUTES, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');
      expect(code).toMatch(/^import \{ Portfolio\w+Screen \} from '@\/features\/career';/m);
      expect(code).not.toMatch(/\buse[A-Z]\w+\(/);
    }
  });

  it('feature xuất đủ 6 màn ở barrel; màn Nghề nghiệp gắn thẻ Portfolio', () => {
    const barrel = src('index.ts');
    for (const name of [
      'PortfolioHomeScreen',
      'PortfolioProfileScreen',
      'PortfolioAppearanceScreen',
      'PortfolioAddProjectScreen',
      'PortfolioProjectScreen',
      'PortfolioPreviewScreen',
    ]) {
      expect(barrel).toContain(`export { ${name} }`);
    }
    expect(src('screens', 'CareerHomeScreen.tsx')).toContain('<PortfolioEntryCard />');
  });
});

describe('PortfolioEntryCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag.current = true;
  });

  it('cờ career bật ⇒ thẻ "Portfolio một chạm" mở /me/career/portfolio', async () => {
    await render(<PortfolioEntryCard />);
    await fireEvent.press(screen.getByText('Portfolio một chạm'));
    expect(router.push).toHaveBeenCalledWith('/me/career/portfolio');
  });

  it.each([[false], [undefined]])(
    'cờ %s (tắt/chưa biết) ⇒ ẩn hẳn, không dẫn vào 404',
    async (flag) => {
      mockFlag.current = flag;
      await render(<PortfolioEntryCard />);
      expect(screen.queryByText('Portfolio một chạm')).toBeNull();
    },
  );
});
