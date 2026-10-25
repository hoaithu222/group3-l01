import { act, renderHook } from '@testing-library/react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useSweep } from '../components/visual/use-sweep';

/** Vòng tiến độ "quét" từ 0 tới đích một lần, trượt tới đích mới khi số đổi; "Giảm chuyển động" bật ⇒ nhảy thẳng tới đích. */
jest.mock('react-native-reanimated', () => ({ useReducedMotion: jest.fn() }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(useReducedMotion).mockReturnValue(false);
});
afterEach(() => jest.useRealTimers());

describe('useSweep', () => {
  it('lần vẽ đầu ở 0, rồi quét qua giá trị trung gian và dừng ĐÚNG ở đích', async () => {
    const { result } = await renderHook(() => useSweep(0.4));
    expect(result.current).toBe(0);

    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(0.4);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(0.4);
  });

  it('đích đổi ⇒ trượt từ giá trị đang hiện (không quay về 0)', async () => {
    const { rerender, result } = await renderHook(
      ({ value }: { value: number }) => useSweep(value),
      {
        initialProps: { value: 0.2 },
      },
    );
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(0.2);

    await rerender({ value: 0.8 });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current).toBeGreaterThan(0.2);
    expect(result.current).toBeLessThan(0.8);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(0.8);
  });

  it('đích 0 (thẻ ẩn/đang tải) ⇒ không chạy khung nào', async () => {
    const spy = jest.spyOn(globalThis, 'requestAnimationFrame');
    await renderHook(() => useSweep(0));

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('"Giảm chuyển động" bật ⇒ trả thẳng đích ngay lần vẽ đầu, không có giá trị trung gian', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const { result } = await renderHook(() => useSweep(0.6));

    expect(result.current).toBe(0.6);
  });
});
