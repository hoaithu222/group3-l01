/**
 * Nonce dùng MỘT LẦN (D-27) cho `login` / `register`.
 *
 *  - Lấy nonce (`GET /auth/nonce`) NGAY TRƯỚC request thật và nhét vào body.
 *  - BE từ chối nonce (`AUTH_018` — đã dùng / hết hạn / lạc instance) ⇒ request CHƯA được xử lý
 *    (nonce bị tiêu thụ TRƯỚC khi so mật khẩu), nên lấy nonce KHÁC và thử lại ĐÚNG MỘT LẦN.
 *  - Lần hai vẫn bị từ chối, hoặc lỗi khác (sai mật khẩu…) ⇒ KHÔNG thử lại.
 *  - Lấy nonce hỏng ⇒ KHÔNG gửi request thật.
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { AxiosError } from 'axios';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { authService } from '@/core/api/auth';
import { getOrCreateDeviceId } from '@/shared/utils/browser';

const USER = { id: 'u1', email: 'an@congty.vn', name: 'An', roles: ['admin'], permissions: [] };
const SESSION = { success: true, data: { accessToken: 'tok', tokenType: 'Bearer', user: USER } };

const errorBody = (code: string) => ({ success: false, error: { code, message: 'x' } });

let nonceCounter = 0;
let nonceStatus = 200;
const posts: Array<{ url: string; nonce: unknown; deviceId: string | null; platform: string | null }> = [];
let loginResponder: (n: number) => Response;

const server = setupServer(
  http.get('*/auth/nonce', () => {
    nonceCounter += 1;
    return nonceStatus === 200
      ? HttpResponse.json({ success: true, data: { nonce: `nonce-${nonceCounter}`, expiresIn: 120 } })
      : new HttpResponse(null, { status: nonceStatus });
  }),
  http.post('*/auth/login', async ({ request }) => {
    const body = (await request.json()) as { nonce?: unknown };
    posts.push({
      url: 'login',
      nonce: body.nonce,
      deviceId: request.headers.get('x-device-id'),
      platform: request.headers.get('x-client-platform'),
    });
    return loginResponder(posts.length);
  }),
  http.post('*/auth/register', async ({ request }) => {
    const body = (await request.json()) as { nonce?: unknown };
    posts.push({ url: 'register', nonce: body.nonce, deviceId: null, platform: null });
    return loginResponder(posts.length);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  nonceCounter = 0;
  nonceStatus = 200;
  posts.length = 0;
  loginResponder = () => HttpResponse.json(SESSION);
});

const CREDENTIALS = { email: 'an@congty.vn', password: 'mat-khau' };

describe('login — nonce lấy ngay trước, gửi trong body', () => {
  it('gửi đúng nonce vừa lấy và `X-Device-Id` của trình duyệt này; KHÔNG khai `X-Client-Platform` (web ⇒ BE trả cookie, không trả refresh token trong body)', async () => {
    const res = await authService.login(CREDENTIALS);

    expect(res.data.accessToken).toBe('tok');
    expect(nonceCounter).toBe(1);
    expect(posts).toEqual([
      { url: 'login', nonce: 'nonce-1', deviceId: getOrCreateDeviceId(), platform: null },
    ]);
  });

  it('mỗi lần đăng nhập lấy một nonce MỚI (không dùng lại nonce cũ)', async () => {
    await authService.login(CREDENTIALS);
    await authService.login(CREDENTIALS);

    expect(posts.map((p) => p.nonce)).toEqual(['nonce-1', 'nonce-2']);
  });
});

describe('AUTH_018 (nonce bị từ chối) — thử lại ĐÚNG MỘT lần', () => {
  it('lần đầu bị từ chối ⇒ lấy nonce KHÁC rồi gửi lại, thành công', async () => {
    loginResponder = (n) =>
      n === 1
        ? HttpResponse.json(errorBody('AUTH_018'), { status: 401 })
        : HttpResponse.json(SESSION);

    const res = await authService.login(CREDENTIALS);

    expect(res.data.accessToken).toBe('tok');
    expect(nonceCounter).toBe(2);
    expect(posts.map((p) => p.nonce)).toEqual(['nonce-1', 'nonce-2']);
  });

  it('⛔ lần hai vẫn bị từ chối ⇒ báo lỗi, KHÔNG thử lần ba', async () => {
    loginResponder = () => HttpResponse.json(errorBody('AUTH_018'), { status: 401 });

    const failure = await authService.login(CREDENTIALS).then(
      () => null,
      (e: unknown) => e,
    );

    expect(failure).toBeInstanceOf(AxiosError);
    expect((failure as AxiosError).response?.status).toBe(401);
    expect(nonceCounter).toBe(2);
    expect(posts).toHaveLength(2);
  });

  it('sai mật khẩu (401 KHÁC AUTH_018) ⇒ KHÔNG thử lại — mỗi lượt gửi tốn một lượt thử mật khẩu', async () => {
    loginResponder = () => HttpResponse.json(errorBody('AUTH_002'), { status: 401 });

    await authService.login(CREDENTIALS).catch(() => undefined);

    expect(nonceCounter).toBe(1);
    expect(posts).toHaveLength(1);
  });

  it('register cũng theo đúng luật đó', async () => {
    loginResponder = (n) =>
      n === 1
        ? HttpResponse.json(errorBody('AUTH_018'), { status: 401 })
        : HttpResponse.json(SESSION, { status: 201 });

    await authService.register({ email: 'a@b.vn', name: 'A', password: 'secret1' });

    expect(posts.map((p) => `${p.url}:${String(p.nonce)}`)).toEqual([
      'register:nonce-1',
      'register:nonce-2',
    ]);
  });
});

describe('lấy nonce hỏng', () => {
  it.each([429, 500, 503])(
    'GET /auth/nonce trả %i ⇒ KHÔNG BAO GIỜ gửi request thật với nonce rỗng',
    async (status) => {
      nonceStatus = status;

      const failure = await authService.login(CREDENTIALS).then(
        () => null,
        (e: unknown) => e,
      );

      expect(failure).toBeInstanceOf(AxiosError);
      expect((failure as AxiosError).response?.status).toBe(status);
      expect(posts).toHaveLength(0);
    },
  );
});
