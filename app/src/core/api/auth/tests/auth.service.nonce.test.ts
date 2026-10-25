import { AxiosError } from 'axios';

import { apiClient } from '@/core/api/client';
import { purgeSession } from '@/core/api/session';

import { authService } from '../auth.service';
import { createFakeAuthAdapter } from './fake-auth-adapter';

/**
 * `be.md` đổi hợp đồng: `login`/`register` giờ đòi một mã dùng MỘT LẦN
 * (`GET /auth/nonce`) lấy NGAY TRƯỚC lượt gọi thật. Bộ test này chốt:
 *
 *   1. `login()`/`register()` gọi `GET /auth/nonce` TRƯỚC, và nhét `nonce`
 *      nhận được vào body của lượt gọi thật.
 *   2. Nonce lấy hỏng ⇒ lượt gọi thật KHÔNG BAO GIỜ được gửi (đếm số lần gọi
 *      từng endpoint, không chỉ đoán qua kết quả cuối).
 *
 * Bộ `biometricLogin()` — không tự lấy nonce — nằm ở `auth.service.biometric.test.ts`.
 */
const fake = createFakeAuthAdapter();

beforeAll(() => {
  apiClient.defaults.adapter = fake.adapter;
});

beforeEach(async () => {
  fake.reset();
  await purgeSession();
});

describe('login() — lấy nonce trước, gửi nonce trong body', () => {
  it('gọi GET /auth/nonce TRƯỚC POST /auth/login, và nhét đúng nonce vào body', async () => {
    fake.responders.set('/auth/nonce', () => ({ data: { expiresIn: 120, nonce: 'nonce-abc' }, status: 200 }));
    fake.responders.set('/auth/login', () => ({
      data: { accessToken: 'access-1', refreshToken: 'refresh-1' },
      status: 200,
    }));

    await authService.login({ email: 'a@b.com', password: 'mat-khau' });

    expect(fake.calls.map((c) => c.url)).toEqual(['/auth/nonce', '/auth/login']);
    expect(fake.calls[1]?.data).toMatchObject({
      email: 'a@b.com',
      nonce: 'nonce-abc',
      password: 'mat-khau',
    });
  });

  it('nonce lấy HỎNG ⇒ KHÔNG BAO GIỜ gửi POST /auth/login', async () => {
    fake.responders.set('/auth/nonce', () => ({ data: {}, status: 500 }));

    await expect(authService.login({ email: 'a@b.com', password: 'x' })).rejects.toBeInstanceOf(
      AxiosError,
    );

    expect(fake.countCallsTo('/auth/nonce')).toBe(1);
    expect(fake.countCallsTo('/auth/login')).toBe(0);
  });
});

describe('register() — cùng luật với login()', () => {
  it('gọi GET /auth/nonce TRƯỚC POST /auth/register, và nhét nonce vào body', async () => {
    fake.responders.set('/auth/nonce', () => ({ data: { expiresIn: 120, nonce: 'nonce-xyz' }, status: 200 }));
    fake.responders.set('/auth/register', () => ({
      data: { accessToken: 'access-2', refreshToken: 'refresh-2' },
      status: 200,
    }));

    await authService.register({ email: 'c@d.com', name: 'C D', password: 'Mat-khau1' });

    expect(fake.calls.map((c) => c.url)).toEqual(['/auth/nonce', '/auth/register']);
    expect(fake.calls[1]?.data).toMatchObject({ nonce: 'nonce-xyz' });
  });

  it('nonce lấy HỎNG ⇒ KHÔNG BAO GIỜ gửi POST /auth/register', async () => {
    fake.responders.set('/auth/nonce', () => ({ data: {}, status: 500 }));

    await expect(
      authService.register({ email: 'c@d.com', name: 'C D', password: 'Mat-khau1' }),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(fake.countCallsTo('/auth/nonce')).toBe(1);
    expect(fake.countCallsTo('/auth/register')).toBe(0);
  });
});
