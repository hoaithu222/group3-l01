import { act, renderHook } from '@testing-library/react-native';

import {
  computeClockOffset,
  formatTimeLeft,
  timeLeftMs,
  useServerClock,
} from '../hooks/useServerClock';

/** Đồng hồ theo giờ SERVER (README p4-02 §4): độ lệch tính lại ở MỖI response mới, không đóng băng ở lần đầu. */
describe('computeClockOffset / timeLeftMs', () => {
  it('offset = serverNow − Date.now() lúc nhận', () => {
    expect(
      computeClockOffset('2026-09-25T10:00:10.000Z', Date.parse('2026-09-25T10:00:00.000Z')),
    ).toBe(10_000);
    expect(
      computeClockOffset('2026-09-25T09:59:50.000Z', Date.parse('2026-09-25T10:00:00.000Z')),
    ).toBe(-10_000);
  });

  it('serverNow hỏng → 0 (tin đồng hồ máy còn hơn NaN làm đồng hồ đứng)', () => {
    expect(computeClockOffset('không phải ngày', 1234)).toBe(0);
  });

  it('thời gian còn lại tính theo giờ server và âm khi quá hạn', () => {
    expect(timeLeftMs('2026-09-25T10:05:00.000Z', Date.parse('2026-09-25T10:00:00.000Z'))).toBe(
      300_000,
    );
    expect(timeLeftMs('2026-09-25T10:05:00.000Z', Date.parse('2026-09-25T10:06:00.000Z'))).toBe(
      -60_000,
    );
  });
});

describe('formatTimeLeft', () => {
  it.each([
    [0, '00:00'],
    [-5000, '00:00'],
    [59_999, '00:59'],
    [61_000, '01:01'],
    [12 * 60_000 + 5000, '12:05'],
    [125 * 60_000, '125:00'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatTimeLeft(ms)).toBe(expected);
  });
});

describe('useServerClock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-25T10:00:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('máy chậm 30 giây so với server → nowMs bù đúng, và nhích theo từng giây', async () => {
    const { result } = await renderHook(() => useServerClock('2026-09-25T10:00:30.000Z'));
    expect(result.current.offsetMs).toBe(30_000);
    expect(result.current.nowMs).toBe(Date.parse('2026-09-25T10:00:30.000Z'));

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.nowMs).toBe(Date.parse('2026-09-25T10:00:33.000Z'));
  });

  it('response mới (serverNow đổi) → offset tính LẠI, không giữ độ lệch cũ', async () => {
    const { rerender, result } = await renderHook(
      (props: { serverNow: string }) => useServerClock(props.serverNow),
      { initialProps: { serverNow: '2026-09-25T10:00:30.000Z' } },
    );
    expect(result.current.offsetMs).toBe(30_000);

    await act(async () => {
      jest.advanceTimersByTime(5000); // máy đi 5 giây
    });
    // Server báo giờ đã 10:00:41 lúc máy đang 10:00:05 → lệch 36 giây.
    await rerender({ serverNow: '2026-09-25T10:00:41.000Z' });
    expect(result.current.offsetMs).toBe(36_000);
    expect(result.current.nowMs).toBe(Date.parse('2026-09-25T10:00:41.000Z'));
  });

  it('enabled=false → không tick', async () => {
    const { result } = await renderHook(() => useServerClock('2026-09-25T10:00:00.000Z', false));
    const before = result.current.nowMs;
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.nowMs).toBe(before);
  });
});
