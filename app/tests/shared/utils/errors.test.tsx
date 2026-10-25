import { act, renderHook } from '@testing-library/react-native';
import { AxiosError, type AxiosResponse } from 'axios';

import {
  errorCodeOf,
  httpStatusOf,
  isNetworkError,
  retryAfterSecondsOf,
  toErrorMessage,
  useRetryCountdown,
} from '@/shared/utils/errors';

/** Lỗi axios có phản hồi (hoặc không — mất mạng) với thân/headers tuỳ ý. */
interface FakeResponse {
  data?: unknown;
  headers?: Record<string, unknown>;
  status?: number;
}

function axiosError(response?: FakeResponse): AxiosError {
  const config = { headers: {} } as never;
  return new AxiosError(
    'Request failed',
    response ? 'ERR_BAD_REQUEST' : 'ERR_NETWORK',
    config,
    {},
    response
      ? ({ config, headers: {}, status: 400, statusText: '', ...response } as AxiosResponse)
      : undefined,
  );
}

const rateLimited = (details?: unknown, headers: Record<string, unknown> = {}) =>
  axiosError({
    data: { error: { code: 'RATE_002', details, message: 'Quá nhanh' } },
    headers,
    status: 429,
  });

describe('đọc mã/trạng thái từ lỗi', () => {
  it('errorCodeOf / httpStatusOf đọc thân lỗi có cấu trúc của BE', () => {
    const error = axiosError({ data: { error: { code: 'CONV_003' } }, status: 403 });

    expect(errorCodeOf(error)).toBe('CONV_003');
    expect(httpStatusOf(error)).toBe(403);
  });

  it('không phải lỗi axios ⇒ undefined; mất mạng ⇒ không có mã HTTP nhưng isNetworkError', () => {
    expect(errorCodeOf(new Error('x'))).toBeUndefined();
    expect(httpStatusOf('x')).toBeUndefined();
    expect(isNetworkError(axiosError())).toBe(true);
    expect(isNetworkError(axiosError({ status: 500 }))).toBe(false);
    expect(isNetworkError(new Error('x'))).toBe(false);
  });

  it('toErrorMessage (dùng lại của core) trả câu tiếng Việt cho mất mạng', () => {
    expect(toErrorMessage(axiosError())).toMatch(/kết nối|mạng/i);
  });
});

describe('retryAfterSecondsOf', () => {
  it('429 + details.retryAfterSeconds ⇒ làm tròn LÊN', () => {
    expect(retryAfterSecondsOf(rateLimited({ retryAfterSeconds: 4.2 }))).toBe(5);
  });

  it('thiếu trong thân thì lấy header Retry-After (chuỗi hoặc số)', () => {
    expect(retryAfterSecondsOf(rateLimited(undefined, { 'retry-after': '30' }))).toBe(30);
    expect(retryAfterSecondsOf(rateLimited(undefined, { 'retry-after': 7 }))).toBe(7);
  });

  it('không phải 429, hoặc số không hợp lệ ⇒ undefined', () => {
    expect(
      retryAfterSecondsOf(
        axiosError({ data: { error: { details: { retryAfterSeconds: 9 } } }, status: 400 }),
      ),
    ).toBeUndefined();
    expect(retryAfterSecondsOf(rateLimited({ retryAfterSeconds: 0 }))).toBeUndefined();
    expect(retryAfterSecondsOf(rateLimited({ retryAfterSeconds: 'nhanh' }))).toBeUndefined();
    expect(retryAfterSecondsOf(new Error('x'))).toBeUndefined();
  });
});

describe('useRetryCountdown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('start(3) đếm 3 → 2 → 1 → 0 mỗi giây rồi dừng, isWaiting đổi theo', async () => {
    const { result } = await renderHook(() => useRetryCountdown());
    expect(result.current).toMatchObject({ isWaiting: false, remaining: 0 });

    await act(async () => result.current.start(3));
    expect(result.current).toMatchObject({ isWaiting: true, remaining: 3 });

    await act(async () => void jest.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(2);
    await act(async () => void jest.advanceTimersByTime(2000));
    expect(result.current).toMatchObject({ isWaiting: false, remaining: 0 });
  });

  it('startFromError: 429 ⇒ đếm theo retryAfterSeconds và trả true; lỗi khác ⇒ false, không đếm', async () => {
    const { result } = await renderHook(() => useRetryCountdown());

    let handled = true;
    await act(async () => {
      handled = result.current.startFromError(new Error('khác'));
    });
    expect(handled).toBe(false);
    expect(result.current.remaining).toBe(0);

    await act(async () => {
      handled = result.current.startFromError(rateLimited({ retryAfterSeconds: 42 }));
    });
    expect(handled).toBe(true);
    expect(result.current.remaining).toBe(42);
  });

  it('start với số không hợp lệ (0, âm, NaN) không khoá nút; reset() gỡ khoá ngay', async () => {
    const { result } = await renderHook(() => useRetryCountdown());

    await act(async () => result.current.start(0));
    await act(async () => result.current.start(Number.NaN));
    expect(result.current.isWaiting).toBe(false);

    await act(async () => result.current.start(10));
    expect(result.current.isWaiting).toBe(true);
    await act(async () => result.current.reset());
    expect(result.current).toMatchObject({ isWaiting: false, remaining: 0 });
  });
});
