import { act, render, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/shared/ui/button';
import { BorderBeam, GlowOrbs, PulseDot, ShimmerSweep, Sparkles } from '@/shared/ui/effects';

/** Ép được nhánh "Giảm chuyển động" theo từng ca — cùng khuôn `tests/ui/motion.test.tsx`. */
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) };
});

/** Giả lập `onLayout` — Jest không có tầng native đo khung, lớp vẽ chỉ dựng SAU khi biết cỡ. */
function layout(width: number, height: number) {
  return { nativeEvent: { layout: { height, width, x: 0, y: 0 } } };
}

/**
 * ⚠️ Chỉ kiểm HÀNH VI (`docs/rules/testing.md`): hình vẽ và chuyển động không kiểm được trong Jest. Thứ kiểm được: nội dung
 * bọc bên trong vẫn hiện và bấm được, lớp trang trí KHÔNG lọt vào cây trợ năng, và nhánh "Giảm chuyển động" không làm mất nội
 * dung. (Vòng lặp trang trí cố ý không chạy trong Jest — `useLoopProgress`.)
 */
describe('effects', () => {
  beforeEach(() => {
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('BorderBeam giữ nguyên nội dung và cú chạm của thẻ bên trong', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <BorderBeam className="rounded-md p-md">
        <Button label="Ôn ngay" onPress={onPress} />
      </BorderBeam>,
    );

    await userEvent.press(screen.getByRole('button', { name: 'Ôn ngay' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('BorderBeam dựng lớp vẽ sau khi đo khung mà không làm mất nội dung', async () => {
    const screen = await render(
      <BorderBeam testID="beam">
        <Text>Đến hạn ôn</Text>
      </BorderBeam>,
    );

    await act(() => screen.getByTestId('beam').props.onLayout(layout(320, 120)));
    expect(screen.getByText('Đến hạn ôn')).toBeOnTheScreen();
    expect(screen.queryAllByRole('image')).toHaveLength(0);
  });

  it('"Giảm chuyển động" vẫn vẽ đủ nội dung (viền tĩnh thay tia chạy)', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const screen = await render(
      <BorderBeam>
        <Text>Phòng đang mở</Text>
      </BorderBeam>,
    );

    expect(screen.getByText('Phòng đang mở')).toBeOnTheScreen();
  });

  it.each([
    ['GlowOrbs', <GlowOrbs key="orbs" />],
    ['ShimmerSweep', <ShimmerSweep key="sweep" loop />],
    ['Sparkles', <Sparkles key="sparkles" count={5} />],
    ['PulseDot không nhãn', <PulseDot key="dot" />],
  ])('%s là trang trí thuần — không có ô trợ năng nào', async (_name, element) => {
    const screen = await render(element);

    expect(screen.queryAllByRole('image')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('PulseDot có nhãn thì đọc được trạng thái', async () => {
    const screen = await render(<PulseDot label="Đang diễn ra" />);

    expect(screen.getByLabelText('Đang diễn ra')).toBeOnTheScreen();
  });
});
