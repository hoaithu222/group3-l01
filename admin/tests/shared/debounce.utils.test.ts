import { describe, expect, it, vi } from 'vitest';
import { debounce } from '@/shared/utils/browser/debounce.utils';

describe('debounce', () => {
  it('gộp nhiều lần gọi thành một, dùng đối số cuối', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const d = debounce(spy, 100);
    d('a');
    d('b');
    d('c');
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('c');
    vi.useRealTimers();
  });

  it('cancel() huỷ lần chờ', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const d = debounce(spy, 100);
    d('x');
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(spy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('flush() chạy ngay; flush khi rỗng là no-op', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const d = debounce(spy, 100);
    d.flush();
    expect(spy).not.toHaveBeenCalled();
    d('y');
    d.flush();
    expect(spy).toHaveBeenCalledExactlyOnceWith('y');
    vi.advanceTimersByTime(500);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('gọi lại từ bên trong fn không bị lần dọn muộn xoá mất', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    let n = 0;
    const d: ReturnType<typeof debounce<[number]>> = debounce((v: number) => {
      seen.push(v);
      if (++n < 2) d(v + 1);
    }, 100);
    d(1);
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(100);
    expect(seen).toEqual([1, 2]);
    vi.useRealTimers();
  });
});
