import { act, renderHook } from '@testing-library/react-native';

import { STALE_REFETCH_MS, useStaleRefetch } from '../hooks/useStaleRefetch';

/**
 * `stale: true` (app.md §4, §8): hiện banner và tự tải lại ĐÚNG MỘT LẦN sau 60 giây — không lặp vô hạn dù báo cáo vẫn stale. Dùng fake timers.
 */
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

describe('useStaleRefetch', () => {
  it('stale → chưa gọi trước 60 giây, đúng 60 giây thì gọi MỘT lần, và không gọi lại dù vẫn stale', async () => {
    const refetch = jest.fn();
    await renderHook(() => useStaleRefetch(true, 'b1|ALL', refetch));

    await advance(STALE_REFETCH_MS - 1);
    expect(refetch).not.toHaveBeenCalled();
    await advance(1);
    expect(refetch).toHaveBeenCalledTimes(1);
    await advance(10 * STALE_REFETCH_MS);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('không stale → không hẹn gì', async () => {
    const refetch = jest.fn();
    await renderHook(() => useStaleRefetch(false, 'b1|ALL', refetch));

    await advance(5 * STALE_REFETCH_MS);

    expect(refetch).not.toHaveBeenCalled();
  });

  it('tính xong trước 60 giây (stale → false) → huỷ hẹn', async () => {
    const refetch = jest.fn();
    const { rerender } = await renderHook(({ stale }: { stale: boolean }) => useStaleRefetch(stale, 'b1|ALL', refetch), { initialProps: { stale: true } });

    await advance(30_000);
    await rerender({ stale: false });
    await advance(5 * STALE_REFETCH_MS);

    expect(refetch).not.toHaveBeenCalled();
  });

  it('đổi kỳ (resetKey mới) thì kỳ mới cũng được hẹn MỘT lần', async () => {
    const refetch = jest.fn();
    const { rerender } = await renderHook(({ key }: { key: string }) => useStaleRefetch(true, key, refetch), { initialProps: { key: 'b1|ALL' } });

    await advance(STALE_REFETCH_MS);
    expect(refetch).toHaveBeenCalledTimes(1);
    await rerender({ key: 'b1|M:2026-09' });
    await advance(STALE_REFETCH_MS);

    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('đã tính xong (stale → false) rồi lại stale ở lần thay đổi kế tiếp → được hẹn lại', async () => {
    const refetch = jest.fn();
    const { rerender } = await renderHook(({ stale }: { stale: boolean }) => useStaleRefetch(stale, 'b1|ALL', refetch), { initialProps: { stale: true } });

    await advance(STALE_REFETCH_MS);
    expect(refetch).toHaveBeenCalledTimes(1);
    await rerender({ stale: false });
    await rerender({ stale: true });
    await advance(STALE_REFETCH_MS);

    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('gỡ màn (unmount) trước 60 giây → không gọi', async () => {
    const refetch = jest.fn();
    const { unmount } = await renderHook(() => useStaleRefetch(true, 'b1|ALL', refetch));

    await unmount();
    await advance(5 * STALE_REFETCH_MS);

    expect(refetch).not.toHaveBeenCalled();
  });
});
