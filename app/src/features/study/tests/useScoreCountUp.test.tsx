import { act, renderHook } from '@testing-library/react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useScoreCountUp } from '../hooks/useScoreCountUp';

/**
 * app.md p4-02 §7: điểm "chạy lên" từ 0 khi mở màn kết quả; "Giảm chuyển động" của hệ điều hành BẬT ⇒ không chạy, hiện
 * thẳng số thật. Giá trị cuối LUÔN là số nguyên văn (kể cả 66,7).
 */
jest.mock('react-native-reanimated', () => ({ useReducedMotion: jest.fn() }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(useReducedMotion).mockReturnValue(false);
});
afterEach(() => jest.useRealTimers());

describe('useScoreCountUp', () => {
  it('bắt đầu ở 0, đi qua giá trị trung gian rồi dừng ĐÚNG ở điểm thật', async () => {
    const { result } = await renderHook(() => useScoreCountUp(80));
    expect(result.current).toBe(0);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(80);

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(80);
  });

  it('điểm lẻ: bước trung gian làm tròn nhưng số cuối giữ nguyên 66,7', async () => {
    const { result } = await renderHook(() => useScoreCountUp(66.7));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(66.7);
  });

  it('"Giảm chuyển động" bật: hiện thẳng điểm thật ngay từ lần vẽ đầu, không qua số trung gian', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const { result } = await renderHook(() => useScoreCountUp(80));
    expect(result.current).toBe(80);
  });
});
