import { act, render, userEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/shared/ui/button';
import { AnimatedNumber, PressableScale, Reveal, type RevealKind } from '@/shared/ui/motion';

/**
 * Jest mặc định `useReducedMotion() = false` nên nhánh "Giảm chuyển động" không bao giờ chạy nếu không ép — bọc để đổi được
 * giá trị theo từng ca (cùng khuôn `live-quiz/tests/reduced-motion.test.tsx`; `jest.spyOn` không dùng được vì export của
 * module ES không định nghĩa lại được).
 */
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { ...actual, __esModule: true, useReducedMotion: jest.fn(() => false) };
});

/**
 * ⚠️ Chỉ test HÀNH VI — hiệu ứng vào (layout animation của Reanimated) không chạy trong Jest, và style của NativeWind cũng
 * không (`docs/rules/testing.md`). Thứ kiểm được: lớp bọc KHÔNG nuốt nội dung, không nuốt cú chạm, và nhánh "Giảm chuyển
 * động" không làm mất nội dung.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('Reveal', () => {
  beforeEach(() => {
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  it.each<RevealKind>(['rise', 'fade', 'zoom'])('kiểu %s vẽ được nội dung', async (kind) => {
    const screen = await render(
      <Reveal index={2} kind={kind}>
        <Text>Hôm nay</Text>
      </Reveal>,
    );

    expect(screen.getByText('Hôm nay')).toBeOnTheScreen();
  });

  it('không nuốt cú chạm của nút bên trong', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <Reveal>
        <Button label="Bắt đầu" onPress={onPress} />
      </Reveal>,
    );

    await userEvent.press(screen.getByRole('button', { name: 'Bắt đầu' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('bật "Giảm chuyển động" thì nội dung vẫn hiện ngay (không bị giữ ở trạng thái ẩn)', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const screen = await render(
      <Reveal index={9} kind="zoom">
        <Text>Thành tích</Text>
      </Reveal>,
    );

    expect(screen.getByText('Thành tích')).toBeOnTheScreen();
    expect(useReducedMotion).toHaveBeenCalled();
  });

  it('index âm không làm hỏng (độ trễ kẹp về 0)', async () => {
    const screen = await render(
      <Reveal index={-3}>
        <Text>Đầu trang</Text>
      </Reveal>,
    );

    expect(screen.getByText('Đầu trang')).toBeOnTheScreen();
  });
});

/**
 * Vùng bấm co nhẹ. Co giãn là style của Reanimated ⇒ không kiểm được trong Jest; thứ kiểm được: không nuốt nội dung, gọi
 * đúng `onPress` / `onPressIn` / `onPressOut` của nơi gọi (lớp co giãn CHÈN handler riêng, không được đè mất handler của
 * nơi gọi), `disabled` chặn được, và hàm `children`/`contentClassName` nhận được trạng thái `pressed`.
 */
describe('PressableScale', () => {
  beforeEach(() => {
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('vẽ nội dung và gọi onPress cùng handler nhấn/nhả của nơi gọi', async () => {
    const onPress = jest.fn();
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const screen = await render(
      <PressableScale
        accessibilityLabel="Mở Tin nhắn"
        accessibilityRole="button"
        contentClassName="rounded-md bg-bg-1 p-sm"
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Text>Tin nhắn</Text>
      </PressableScale>,
    );

    expect(screen.getByText('Tin nhắn')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Mở Tin nhắn' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it('disabled thì không gọi onPress', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        disabled
        onPress={onPress}
      >
        <Text>Đã khoá</Text>
      </PressableScale>,
    );

    await userEvent.press(screen.getByText('Đã khoá'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('children dạng hàm nhận trạng thái pressed; "Giảm chuyển động" vẫn bấm được', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const onPress = jest.fn();
    const contentClassName = jest.fn(({ pressed }: { pressed: boolean }) =>
      pressed ? 'bg-bg-2' : 'bg-bg-1',
    );
    const screen = await render(
      <PressableScale
        accessibilityRole="button"
        contentClassName={contentClassName}
        fill
        onPress={onPress}
      >
        {({ pressed }) => <Text>{pressed ? 'Đang nhấn' : 'Thẻ học'}</Text>}
      </PressableScale>,
    );

    expect(screen.getByText('Thẻ học')).toBeOnTheScreen();
    expect(contentClassName).toHaveBeenCalledWith(expect.objectContaining({ pressed: false }));
    await userEvent.press(screen.getByText('Thẻ học'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

/**
 * Con số chạy. Kiểm HÀNH VI: tới đúng số cuối, trình đọc màn hình nghe số cuối ngay từ đầu (không nghe số trung gian), và
 * "Giảm chuyển động" thì hiện ngay số cuối không qua bước đếm.
 */
describe('AnimatedNumber', () => {
  beforeEach(() => {
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('đếm tới đúng số cuối, nhãn trợ năng là số cuối ngay từ đầu', async () => {
    const screen = await render(<AnimatedNumber value={1250} />);

    expect(screen.getByLabelText('1.250')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByText('1.250')).toBeOnTheScreen());
  });

  it('"Giảm chuyển động" thì hiện ngay số cuối', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const screen = await render(
      <AnimatedNumber format={(n) => `${String(Math.round(n))} xu`} value={42} />,
    );

    expect(screen.getByText('42 xu')).toBeOnTheScreen();
  });

  it('countOnMount={false} hiện ngay số ban đầu', async () => {
    const screen = await render(<AnimatedNumber countOnMount={false} value={7} />);

    expect(screen.getByText('7')).toBeOnTheScreen();
  });

  /**
   * Hai ca chuyển từ `coins/hooks/useCountUp` (đã gỡ — số dư Ví giờ dùng `AnimatedNumber countOnMount={false}`). Đồng hồ
   * giả: bộ đếm đi theo `Date.now()` + `requestAnimationFrame`, cả hai đều do đồng hồ giả của Jest điều khiển.
   */
  describe('khi value đổi', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const shownNumber = (screen: Awaited<ReturnType<typeof render>>) =>
      Number(screen.getByTestId('counter').props.children);

    it('chạy qua số trung gian rồi dừng ĐÚNG ở số mới', async () => {
      const screen = await render(
        <AnimatedNumber countOnMount={false} testID="counter" value={100} />,
      );

      await screen.rerender(<AnimatedNumber countOnMount={false} testID="counter" value={200} />);
      await act(async () => {
        jest.advanceTimersByTime(150);
      });
      expect(shownNumber(screen)).toBeGreaterThan(100);
      expect(shownNumber(screen)).toBeLessThan(200);

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(shownNumber(screen)).toBe(200);
    });

    it('đổi tiếp giữa chừng: chạy về số MỚI NHẤT (không kẹt ở đích cũ)', async () => {
      const screen = await render(
        <AnimatedNumber countOnMount={false} testID="counter" value={0} />,
      );

      await screen.rerender(<AnimatedNumber countOnMount={false} testID="counter" value={500} />);
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      await screen.rerender(<AnimatedNumber countOnMount={false} testID="counter" value={90} />);
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      expect(shownNumber(screen)).toBe(90);
    });
  });
});
