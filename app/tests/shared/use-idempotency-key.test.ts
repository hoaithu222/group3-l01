import { act, renderHook } from '@testing-library/react-native';
import { AxiosError } from 'axios';

import {
  newIdempotencyKey,
  shouldRotateIdempotencyKey,
  useIdempotencyKey,
} from '@/shared/hooks/useIdempotencyKey';

/**
 * `Idempotency-Key` (p5-04): BE (`idempotency.ts`) chấp nhận khoá 8–128 ký tự, lưu MỌI phản hồi có mã < 500 (kể cả 4xx) 24 giờ theo khoá
 * và KHÔNG so sánh body. Nên khoá chỉ được GIỮ khi phản hồi chưa chốt (mất mạng, 5xx, `RES_004` đang chạy) và phải ĐỔI khi body đổi hoặc
 * BE đã chốt một câu trả lời (4xx, kể cả 429).
 */

function httpError(status: number, code?: string): AxiosError {
  return new AxiosError('HTTP', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: code ? { error: { code, message: code }, success: false } : {},
    headers: {},
    status,
    statusText: '',
  });
}

describe('newIdempotencyKey', () => {
  it('luôn nằm trong 8–128 ký tự, có tiền tố, và không trùng nhau (kể cả cùng chữ ký, cùng mili-giây)', () => {
    const keys = Array.from({ length: 200 }, () => newIdempotencyKey('ws-create', 'cùng-body'));

    expect(new Set(keys).size).toBe(200);
    for (const key of keys) {
      expect(key).toMatch(/^ws-create-/);
      expect(key.length).toBeGreaterThanOrEqual(8);
      expect(key.length).toBeLessThanOrEqual(128);
      expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('chữ ký body khác nhau ⇒ phần băm khác nhau (cùng ý định, hai body không được chung khoá)', () => {
    const a = newIdempotencyKey('tpl-apply', 'course:a,b').split('-')[2];
    const b = newIdempotencyKey('tpl-apply', 'course:a').split('-')[2];
    const again = newIdempotencyKey('tpl-apply', 'course:a,b').split('-')[2];

    expect(a).not.toBe(b);
    expect(a).toBe(again);
  });
});

describe('shouldRotateIdempotencyKey', () => {
  it('4xx dứt khoát (kể cả 409 mã nghiệp vụ và 429 của bộ giới hạn chạy SAU idempotency) ⇒ ĐỔI khoá', () => {
    for (const [status, code] of [
      [400, 'VAL_001'],
      [404, 'TPL_001'],
      [409, 'TPL_003'],
      [409, 'WS_006'],
      [422, 'X'],
      [429, 'RATE_002'],
    ] as const) {
      expect(shouldRotateIdempotencyKey(httpError(status, code))).toBe(true);
    }
  });

  it('mất mạng / timeout / 5xx ⇒ GIỮ khoá (BE không lưu gì, thử lại an toàn)', () => {
    expect(shouldRotateIdempotencyKey(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(false);
    expect(shouldRotateIdempotencyKey(new AxiosError('timeout', 'ECONNABORTED'))).toBe(false);
    expect(shouldRotateIdempotencyKey(httpError(500, 'INTERNAL'))).toBe(false);
    expect(shouldRotateIdempotencyKey(httpError(503))).toBe(false);
  });

  it('RES_004 (lượt trước còn đang chạy ở server) ⇒ GIỮ khoá: đổi khoá là mở đường cho tạo trùng', () => {
    expect(shouldRotateIdempotencyKey(httpError(409, 'RES_004'))).toBe(false);
  });

  it('lỗi không phải HTTP (TypeError, chuỗi…) ⇒ giữ khoá', () => {
    expect(shouldRotateIdempotencyKey(new TypeError('x'))).toBe(false);
    expect(shouldRotateIdempotencyKey('boom')).toBe(false);
    expect(shouldRotateIdempotencyKey(undefined)).toBe(false);
  });
});

describe('useIdempotencyKey', () => {
  it('cùng chữ ký ⇒ khoá ỔN ĐỊNH qua các lần vẽ lại (bấm hai lần/mạng chậm chỉ làm MỘT lần)', async () => {
    const { rerender, result } = await renderHook(
      ({ signature }: { signature: string }) => useIdempotencyKey('ws-create', signature),
      {
        initialProps: { signature: 'a' },
      },
    );
    const first = result.current.key;

    await rerender({ signature: 'a' });
    await rerender({ signature: 'a' });

    expect(result.current.key).toBe(first);
  });

  it('chữ ký đổi (người dùng sửa dữ liệu) ⇒ khoá MỚI; quay lại chữ ký cũ cũng KHÔNG dùng lại khoá cũ', async () => {
    const { rerender, result } = await renderHook(
      ({ signature }: { signature: string }) => useIdempotencyKey('ws-create', signature),
      {
        initialProps: { signature: 'a' },
      },
    );
    const first = result.current.key;

    await rerender({ signature: 'b' });
    const second = result.current.key;
    await rerender({ signature: 'a' });

    expect(second).not.toBe(first);
    // BE có thể đã lưu một 4xx của body 'a' dưới khoá cũ — dùng lại là nhận đúng câu lỗi đó dù dữ liệu đã đúng.
    expect(result.current.key).not.toBe(first);
    expect(result.current.key).not.toBe(second);
  });

  it('rotate() ⇒ khoá MỚI dù chữ ký không đổi (sau một phản hồi 4xx/thành công đã chốt)', async () => {
    const { result } = await renderHook(() => useIdempotencyKey('tpl-apply', 'course:a,b'));
    const first = result.current.key;

    await act(async () => result.current.rotate());

    expect(result.current.key).not.toBe(first);
    expect(result.current.key).toMatch(/^tpl-apply-/);
  });
});
