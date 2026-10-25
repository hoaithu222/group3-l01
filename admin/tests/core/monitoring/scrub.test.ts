/**
 * OPS-03 (p0-11): sự kiện admin gửi lên Sentry KHÔNG mang header auth/cookie, mật khẩu, token, lý do thao tác (`reason`), email; URL bị lọc query nhạy cảm.
 */
import { describe, expect, it } from 'vitest';

import { FILTERED, scrubBreadcrumb, scrubEvent, scrubQueryString, scrubUrl, scrubValue } from '@/core/monitoring/scrub';

describe('scrubEvent', () => {
  it('che header Authorization/Cookie, bỏ request.cookies và request.data, giữ header vô hại', () => {
    const event = scrubEvent({
      request: {
        url: 'https://admin.example.test/reset-password?token=abc&lang=vi',
        headers: { Authorization: 'Bearer eyJ.secret', Cookie: 'a=b', 'User-Agent': 'Chrome' },
        cookies: { refresh: 'x' },
        data: { password: 'p' },
      },
    });
    expect(event.request?.headers).toEqual({ Authorization: FILTERED, Cookie: FILTERED, 'User-Agent': 'Chrome' });
    expect(event.request).not.toHaveProperty('cookies');
    expect(event.request).not.toHaveProperty('data');
    expect(event.request?.url).toBe(`https://admin.example.test/reset-password?token=${encodeURIComponent(FILTERED)}&lang=vi`);
  });

  it('che `reason` (lý do thao tác quản trị) và email/mật khẩu trong extra/contexts, giữ mã hành động', () => {
    const event = scrubEvent({
      extra: { action: 'user.lock', reason: 'Vi phạm nội quy — anh Nguyễn Văn A', email: 'a@b.c', password: 'x', status: 400 },
      contexts: { react: { componentStack: '\n at Foo', note: 'ghi chú riêng' } },
    });
    expect(event.extra).toEqual({ action: 'user.lock', reason: FILTERED, email: FILTERED, password: FILTERED, status: 400 });
    expect(event.contexts).toEqual({ react: { componentStack: '\n at Foo', note: FILTERED } });
  });

  it('user chỉ giữ id; breadcrumb console bị bỏ, breadcrumb điều hướng/fetch được lọc URL', () => {
    const event = scrubEvent({
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
      breadcrumbs: [
        { category: 'console', message: 'dữ liệu người dùng' },
        { category: 'navigation', data: { from: '/a?token=1', to: '/b?q=tim-kiem&page=2' } },
        { category: 'fetch', data: { url: '/api/v1/users?code=abc', status_code: 200 } },
      ],
    });
    expect(event.user).toEqual({ id: 'u1' });
    expect(event.breadcrumbs).toEqual([
      { category: 'navigation', data: { from: `/a?token=${encodeURIComponent(FILTERED)}`, to: `/b?q=${encodeURIComponent(FILTERED)}&page=2` } },
      { category: 'fetch', data: { url: `/api/v1/users?code=${encodeURIComponent(FILTERED)}`, status_code: 200 } },
    ]);
  });

  it('không bao giờ ném lỗi và không rò dữ liệu khi cấu trúc bất thường', () => {
    const hostile = { request: {} } as { request: Record<string, unknown> };
    Object.defineProperty(hostile.request, 'headers', {
      enumerable: true,
      get() {
        throw new Error('getter độc');
      },
    });
    expect(() => scrubEvent(hostile)).not.toThrow();
    expect(scrubEvent(hostile)).not.toHaveProperty('request.headers');
  });
});

describe('scrubValue / scrubUrl / scrubBreadcrumb', () => {
  it('số/boolean/null giữ nguyên dù tên khoá nhạy cảm; vòng tham chiếu và lồng sâu được chặn', () => {
    expect(scrubValue({ hasToken: true, token: null, code: 500 })).toEqual({ hasToken: true, token: null, code: 500 });
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    expect(scrubValue(a)).toEqual({ name: 'a', self: '[Circular]' });
  });

  it('scrubUrl bỏ #fragment, giữ nguyên URL không có query; scrubQueryString xử lý khoá mã hoá', () => {
    expect(scrubUrl('/a?x=1#token=abc')).toBe('/a?x=1');
    expect(scrubUrl('/a/b')).toBe('/a/b');
    expect(scrubQueryString('%74oken=abc&ok=1')).toBe(`%74oken=${encodeURIComponent(FILTERED)}&ok=1`);
  });

  it('breadcrumb không có data giữ nguyên tham chiếu', () => {
    const b = { category: 'ui.click', message: 'nút' };
    expect(scrubBreadcrumb(b)).toBe(b);
  });
});
