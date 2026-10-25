import { createLatestThrottle } from '../collab/throttle';

jest.useFakeTimers();

describe('createLatestThrottle', () => {
  it('lần đẩy ĐẦU đi ngay; các lần trong cùng cửa sổ gộp thành MỘT (giá trị mới nhất) và đi ở cuối cửa sổ', () => {
    const fn = jest.fn();
    const throttle = createLatestThrottle<number>(fn, 10); // cửa sổ 100 ms
    throttle.push(1);
    expect(fn).toHaveBeenLastCalledWith(1);
    throttle.push(2);
    throttle.push(3);
    expect(fn).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(99);
    expect(fn).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(3);
  });

  it('không bao giờ vượt hz lần trong 1 giây dù đẩy dồn dập (30 Hz)', () => {
    const fn = jest.fn();
    const throttle = createLatestThrottle<number>(fn, 30);
    for (let t = 0; t < 1000; t++) {
      throttle.push(t);
      jest.advanceTimersByTime(1);
    }
    // Trong đúng 1 giây: 1 lần đầu + tối đa 1 lần mỗi 33,3 ms ⇒ ≤ 31, và phải KHÁC 0 (không nuốt hết).
    expect(fn.mock.calls.length).toBeLessThanOrEqual(31);
    expect(fn.mock.calls.length).toBeGreaterThan(20);
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenLastCalledWith(999); // bản CUỐI (chỗ dừng) luôn tới nơi
  });

  it('flush đẩy ngay bản đang chờ; cancel bỏ bản đang chờ', () => {
    const fn = jest.fn();
    const throttle = createLatestThrottle<string>(fn, 10);
    throttle.push('a');
    throttle.push('b');
    throttle.flush();
    expect(fn).toHaveBeenLastCalledWith('b');
    throttle.push('c');
    throttle.push('d');
    throttle.cancel();
    jest.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
