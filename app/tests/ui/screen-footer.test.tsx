import { fireEvent, render } from '@testing-library/react-native';
import { type ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { LeaderboardMeFooter } from '@/features/gamification/components/LeaderboardMeFooter';
import { screen as screenStyles } from '@/shared/ui/screen/screen.styles';

/**
 * Khe `footer` của `Screen` — hai điều mà `tsc`, ESLint và `check:*` đều không thấy:
 *
 *  1. lề ngang: `BottomActionBar` đã TỰ có `px-md`, nên khe `footer` không được cộng
 *     thêm lề nữa (16 + 16 = 32dp, nền đặc của thanh đáy còn hụt hai dải sát mép);
 *  2. vùng an toàn đáy: dòng "Bạn: hạng…" của bảng xếp hạng nằm ở `footer` — trước
 *     đây là `<View>` trần đè lên vạch gạt ngang.
 *
 * ⚠️ Ở mục 1 ta so CHUỖI CLASS mà công thức `tv()` sinh ra, không so `style` — NativeWind
 * không biên dịch trong Jest (xem `docs/rules/testing.md`) nên `toHaveStyle` luôn rỗng.
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderInSafeArea(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
}

/** Gom mọi `paddingBottom` > 0 trong cây đã render (style nội tuyến — `insets.bottom` chỉ biết lúc chạy). */
function collectPaddingBottom(node: unknown, found: number[] = []): number[] {
  if (!node || typeof node !== 'object') return found;
  const current = node as { children?: unknown[] | null; props?: { style?: unknown } };

  const styles: unknown[] = [];
  (function flatten(value: unknown) {
    if (Array.isArray(value)) value.forEach(flatten);
    else if (value && typeof value === 'object') styles.push(value);
  })(current.props?.style);

  for (const style of styles as { paddingBottom?: unknown }[]) {
    if (typeof style.paddingBottom === 'number' && style.paddingBottom > 0) {
      found.push(style.paddingBottom);
    }
  }
  for (const child of current.children ?? []) collectPaddingBottom(child, found);
  return found;
}

describe('Screen — khe footer', () => {
  it('⛔ footer KHÔNG mang lề ngang, dù `padded` bật — thanh đáy tự có px-md', () => {
    // `tv()` trả `undefined` (không phải chuỗi rỗng) cho slot không có class nào.
    const footer = screenStyles({ padded: true }).footer() ?? '';

    expect(footer).not.toMatch(/(^|\s)-?p[xlr]?-/);
  });

  it('lề 16 chỉ áp cho vùng nội dung (`content`), không cho footer', () => {
    expect(screenStyles({ padded: true }).content()).toContain('px-md');
    expect(screenStyles({ padded: false }).content()).not.toContain('px-md');
  });
});

describe('LeaderboardMeFooter — dòng ghim đáy của bảng xếp hạng', () => {
  it('nằm trong BottomActionBar: vùng an toàn đáy được cộng ĐÚNG MỘT LẦN (không đè lên vạch gạt ngang)', async () => {
    const screen = await renderInSafeArea(
      <LeaderboardMeFooter me={{ hidden: false, rank: 12, xp: 340 }} />,
    );

    expect(collectPaddingBottom(screen.toJSON())).toEqual([METRICS.insets.bottom]);
  });

  it('người dùng đang ẩn khỏi bảng: nút "Hiện lại" nhấn được và gọi onShow', async () => {
    const onShow = jest.fn();
    const screen = await renderInSafeArea(
      <LeaderboardMeFooter me={{ hidden: true, rank: null, xp: 0 }} onShow={onShow} />,
    );

    expect(screen.getByText('Bạn đang ẩn khỏi bảng xếp hạng')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Hiện tôi trong bảng xếp hạng nhóm' }),
    );

    expect(onShow).toHaveBeenCalledTimes(1);
  });
});
