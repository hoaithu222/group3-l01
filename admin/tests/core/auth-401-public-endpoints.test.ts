/**
 * 401 ở endpoint xác thực CÔNG KHAI KHÔNG phải "access token hết hạn".
 *
 * ── Lỗi ──────────────────────────────────────────────────────────────────────
 * Interceptor coi MỌI 401 là "cần làm mới token" trừ request có `skipAuthRefresh`.
 * `login` / `register` / `forgot-password` / `reset-password` không khai cờ đó,
 * nên:
 *   - sai mật khẩu (BE trả 401) → interceptor gọi `/auth/refresh` (chưa có cookie
 *     → 401) → coi là "phiên chết" → dọn phiên + `window.location.assign('/login')`
 *     → trang đăng nhập TẢI LẠI, form mất sạch, lỗi không kịp hiện.
 *   - token đặt lại mật khẩu sai/hết hạn (BE trả 401) → cùng đường trên.
 *
 * Bài kiểm đi đúng đường thật: axios + interceptor + `session.ts` + MSW.
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { AxiosError } from 'axios';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/app/store';
import { authService } from '@/core/api/auth';

const calls = { refresh: 0, login: 0, reset: 0 };

const server = setupServer(
  http.get('*/auth/nonce', () =>
    HttpResponse.json({ success: true, data: { nonce: 'nonce-1', expiresIn: 120 } }),
  ),
  http.post('*/auth/login', () => {
    calls.login += 1;
    return HttpResponse.json(
      {
        success: false,
        error: { code: 'AUTH_002', message: 'Email hoặc mật khẩu không đúng' },
        requestId: 'r-1',
      },
      { status: 401 },
    );
  }),
  http.post('*/auth/reset-password', () => {
    calls.reset += 1;
    return HttpResponse.json(
      {
        success: false,
        error: { code: 'AUTH_002', message: 'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn' },
        requestId: 'r-2',
      },
      { status: 401 },
    );
  }),
  http.post('*/auth/refresh', () => {
    calls.refresh += 1;
    return HttpResponse.json(
      { success: false, error: { code: 'AUTH_009', message: 'Không có refresh token' } },
      { status: 401 },
    );
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  calls.refresh = 0;
  calls.login = 0;
  calls.reset = 0;
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setStatus('anonymous');
});

describe('401 ở endpoint xác thực công khai', () => {
  it('sai mật khẩu → lỗi trả về cho form, KHÔNG gọi /auth/refresh', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = await authService
      .login({ email: 'an@congty.vn', password: 'sai-mat-khau' })
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(failure).toBeInstanceOf(AxiosError);
    expect((failure as AxiosError).response?.status).toBe(401);
    expect(calls.login).toBe(1);
    expect(calls.refresh).toBe(0);
    // jsdom in "Not implemented: navigation" khi mã gọi `window.location.assign`
    // — tức là trang đăng nhập đang bị TẢI LẠI thay vì hiện lỗi.
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Not implemented: navigation') }),
    );
    consoleError.mockRestore();
  });

  it('token đặt lại mật khẩu sai → lỗi trả về cho form, KHÔNG gọi /auth/refresh', async () => {
    const failure = await authService
      .resetPassword({ token: 'het-han', newPassword: 'Mat-khau-moi-1' })
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(failure).toBeInstanceOf(AxiosError);
    expect(calls.reset).toBe(1);
    expect(calls.refresh).toBe(0);
  });

  // Việc bỏ qua refresh dựa vào ĐƯỜNG DẪN (`AUTH_NO_REFRESH_PATHS`), không phải mã lỗi: BE bản mới trả
  // `AUTH_001` / `AUTH_008` thay cho `AUTH_002` — kết quả phải như nhau.
  it.each<{ label: string; path: string; code: string; call: () => Promise<unknown> }>([
    {
      label: 'sai mật khẩu (AUTH_001)',
      path: '*/auth/login',
      code: 'AUTH_001',
      call: () => authService.login({ email: 'an@congty.vn', password: 'sai-mat-khau' }),
    },
    {
      label: 'token đặt lại sai (AUTH_008)',
      path: '*/auth/reset-password',
      code: 'AUTH_008',
      call: () => authService.resetPassword({ token: 'het-han', newPassword: 'Mat-khau-moi-1' }),
    },
  ])('mã lỗi mới của BE — $label ⇒ vẫn KHÔNG gọi /auth/refresh', async ({ path, code, call }) => {
    server.use(
      http.post(path, () =>
        HttpResponse.json(
          { success: false, error: { code, message: 'thông điệp của BE' }, requestId: 'r-3' },
          { status: 401 },
        ),
      ),
    );

    const failure = await call().then(
      () => null,
      (e: unknown) => e,
    );

    expect((failure as AxiosError).response?.status).toBe(401);
    expect(calls.refresh).toBe(0);
    expect(useAuthStore.getState().status).toBe('anonymous');
  });
});
