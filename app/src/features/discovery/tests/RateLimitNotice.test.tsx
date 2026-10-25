import { act, render, screen } from '@testing-library/react-native';

import { RateLimitNotice } from '../components/RateLimitNotice';

/** 429 `RATE_002` — đếm ngược `retryAfterSeconds` rồi tự thử lại ĐÚNG MỘT LẦN (không lặp mỗi giây trong lúc refetch). */
describe('RateLimitNotice', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('đếm ngược từng giây; nút "Thử lại" khoá tới khi về 0; về 0 thì tự gọi onRetry một lần', async () => {
    const onRetry = jest.fn();
    await render(<RateLimitNotice seconds={3} onRetry={onRetry} />);

    expect(screen.getByText(/Tự thử lại sau 3 giây/)).toBeOnTheScreen();
    expect(screen.getByText('Thử lại')).toBeDisabled();

    await act(async () => void jest.advanceTimersByTime(1000));
    expect(screen.getByText(/Tự thử lại sau 2 giây/)).toBeOnTheScreen();
    expect(onRetry).not.toHaveBeenCalled();

    await act(async () => void jest.advanceTimersByTime(2000));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Đang thử lại/)).toBeOnTheScreen();

    // Vẫn chờ refetch (component còn đó) — không được gọi lại mỗi giây.
    await act(async () => void jest.advanceTimersByTime(5000));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('bấm "Thử lại" khi đã hết giờ gọi onRetry', async () => {
    const onRetry = jest.fn();
    await render(<RateLimitNotice seconds={1} onRetry={onRetry} />);
    await act(async () => void jest.advanceTimersByTime(1000));
    expect(onRetry).toHaveBeenCalledTimes(1);

    expect(screen.getByText('Thử lại')).toBeEnabled();
  });
});
