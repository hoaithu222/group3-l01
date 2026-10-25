import { act, renderHook } from '@testing-library/react-native';

import { useIsExpired } from '../hooks/useIsExpired';

/**
 * BE không phát sự kiện khi yêu cầu hết hạn: màn cứ mở thì huy hiệu vẫn phải tự chuyển "Đã hết hạn" đúng lúc qua `deadlineAt`.
 * "Bây giờ" nằm trong state (render thuần — React Compiler được bật) và được hẹn giờ cập nhật.
 */
const NOW = new Date('2026-09-25T00:00:00.000Z');
const inMs = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

beforeEach(() => jest.useFakeTimers({ now: NOW }));
afterEach(() => jest.useRealTimers());

describe('useIsExpired', () => {
  it('không có yêu cầu (undefined) → false', async () => {
    const { result } = await renderHook(() => useIsExpired(undefined));

    expect(result.current).toBe(false);
  });

  it('BE báo `expired` → true ngay, không cần hạn', async () => {
    const { result } = await renderHook(() => useIsExpired({ deadlineAt: null, expired: true }));

    expect(result.current).toBe(true);
  });

  it('không hạn → không bao giờ hết hạn', async () => {
    const { result } = await renderHook(() => useIsExpired({ deadlineAt: null, expired: false }));
    await act(async () => jest.advanceTimersByTime(30 * 24 * 3_600_000));

    expect(result.current).toBe(false);
  });

  it('hạn đã qua lúc mở → true ngay', async () => {
    const { result } = await renderHook(() =>
      useIsExpired({ deadlineAt: inMs(-1_000), expired: false }),
    );

    expect(result.current).toBe(true);
  });

  it('còn hạn → false; tự lật sang true ĐÚNG lúc qua hạn (không cần vẽ lại từ ngoài)', async () => {
    const { result } = await renderHook(() =>
      useIsExpired({ deadlineAt: inMs(60_000), expired: false }),
    );
    expect(result.current).toBe(false);

    await act(async () => jest.advanceTimersByTime(59_000));
    expect(result.current).toBe(false);

    await act(async () => jest.advanceTimersByTime(2_000));
    expect(result.current).toBe(true);
  });

  it('hạn xa hơn giới hạn của setTimeout (~24,8 ngày) vẫn lật đúng: hẹn lại từng đoạn', async () => {
    const thirtyDays = 30 * 24 * 3_600_000;
    const { result } = await renderHook(() =>
      useIsExpired({ deadlineAt: inMs(thirtyDays), expired: false }),
    );

    await act(async () => jest.advanceTimersByTime(thirtyDays - 10_000));
    expect(result.current).toBe(false);

    await act(async () => jest.advanceTimersByTime(20_000));
    expect(result.current).toBe(true);
  });

  it('gỡ màn → dọn đúng timer đã hẹn (không còn timer treo)', async () => {
    const setSpy = jest.spyOn(globalThis, 'setTimeout');
    const clearSpy = jest.spyOn(globalThis, 'clearTimeout');
    const { unmount } = await renderHook(() =>
      useIsExpired({ deadlineAt: inMs(60_000), expired: false }),
    );
    // Timer của hook: hẹn ~60 giây (còn lại tới hạn + 50 ms đệm).
    const index = setSpy.mock.calls.findIndex(([, delay]) => delay === 60_050);
    expect(index).toBeGreaterThanOrEqual(0);
    const handle = setSpy.mock.results[index]?.value;

    await unmount();

    expect(clearSpy).toHaveBeenCalledWith(handle);
    setSpy.mockRestore();
    clearSpy.mockRestore();
  });
});
