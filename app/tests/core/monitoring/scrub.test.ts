/**
 * OPS-02 (p0-11): sự kiện/breadcrumb app gửi lên Sentry KHÔNG mang Authorization, refreshToken, body request/response, nội dung tin/nháp;
 * URL mất query và mã bí mật (`/invite/<mã>`, `/live/<pin>`, `/m/<mã họp>`).
 */
import {
  FILTERED,
  scrubBreadcrumb,
  scrubEvent,
  scrubUrl,
  scrubValue,
} from '@/core/monitoring/scrub';

describe('scrubEvent', () => {
  it('che header Authorization/Cookie, bỏ cookies/data/query_string, giữ header vô hại', () => {
    const event = scrubEvent({
      request: {
        url: 'https://staging.superapp.vcijsc.com/api/v1/auth/login?token=abc',
        headers: { Authorization: 'Bearer eyJ.x', Cookie: 'a=b', Accept: 'application/json' },
        cookies: { refresh: 'x' },
        data: { password: 'p' },
        query_string: 'token=abc',
      },
    });
    expect(event.request?.headers).toEqual({
      Authorization: FILTERED,
      Cookie: FILTERED,
      Accept: 'application/json',
    });
    expect(event.request).not.toHaveProperty('cookies');
    expect(event.request).not.toHaveProperty('data');
    expect(event.request).not.toHaveProperty('query_string');
    expect(event.request?.url).toBe('https://staging.superapp.vcijsc.com/api/v1/auth/login');
  });

  it('che refreshToken/mật khẩu/nội dung tin/nháp trong extra và contexts, giữ mã hành động và số', () => {
    const event = scrubEvent({
      extra: { refreshToken: 'r', newPassword: 'n', content: 'tin nhắn riêng', draft: 'nháp', action: 'send', status: 500 },
      contexts: { react: { componentStack: '\n at Foo', deviceToken: 'd' } },
    });
    expect(event.extra).toEqual({
      refreshToken: FILTERED,
      newPassword: FILTERED,
      content: FILTERED,
      draft: FILTERED,
      action: 'send',
      status: 500,
    });
    expect(event.contexts).toEqual({ react: { componentStack: '\n at Foo', deviceToken: FILTERED } });
  });

  it('user chỉ giữ id; breadcrumb console bị bỏ, breadcrumb điều hướng bị che mã bí mật', () => {
    const event = scrubEvent({
      user: { id: 'u1', email: 'a@b.c', username: 'an' },
      breadcrumbs: [
        { category: 'console', message: 'dữ liệu người dùng' },
        { category: 'navigation', data: { from: '/invite/ABC123', to: '/w/ws1?tab=1' } },
      ],
    });
    expect(event.user).toEqual({ id: 'u1' });
    expect(event.breadcrumbs).toEqual([
      { category: 'navigation', data: { from: `/invite/${FILTERED}`, to: '/w/ws1' } },
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

describe('scrubUrl / scrubBreadcrumb / scrubValue', () => {
  it('che đoạn mã bí mật sau invite, invite/e, live, m; giữ đường dẫn thường', () => {
    expect(scrubUrl('https://x.test/invite/e/tok123?x=1')).toBe(`https://x.test/invite/e/${FILTERED}`);
    expect(scrubUrl('/live/482913')).toBe(`/live/${FILTERED}`);
    expect(scrubUrl('/m/abc-defg-hij#frag')).toBe(`/m/${FILTERED}`);
    expect(scrubUrl('/api/v1/workspaces/ws1/channels')).toBe('/api/v1/workspaces/ws1/channels');
  });

  it('breadcrumb HTTP: bỏ body và query; không có data thì giữ nguyên tham chiếu', () => {
    const crumb = scrubBreadcrumb({
      category: 'xhr',
      data: { url: '/api/v1/x?token=abc', request_body: '{"a":1}', status_code: 200 },
    });
    expect(crumb?.data).toEqual({ url: '/api/v1/x', status_code: 200 });
    const plain = { category: 'ui.click', message: 'nút' };
    expect(scrubBreadcrumb(plain)).toBe(plain);
  });

  it('số/boolean/null giữ nguyên dù tên khoá nhạy cảm; vòng tham chiếu được chặn', () => {
    expect(scrubValue({ hasToken: true, token: null, code: 500 })).toEqual({ hasToken: true, token: null, code: 500 });
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    expect(scrubValue(a)).toEqual({ name: 'a', self: '[Circular]' });
  });
});
