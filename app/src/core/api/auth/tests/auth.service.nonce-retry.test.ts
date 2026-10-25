import { AxiosError } from 'axios';

import { apiClient } from '@/core/api/client';
import { purgeSession } from '@/core/api/session';

import { authService } from '../auth.service';
import { createFakeAuthAdapter } from './fake-auth-adapter';

/**
 * Nonce bị từ chối (`AUTH_018`) ⇒ lấy nonce MỚI và thử lại ĐÚNG MỘT LẦN — không hỏi lại người
 * dùng. Lỗi khác (sai mật khẩu, mất mạng) tuyệt đối KHÔNG thử lại: gửi lại mật khẩu sai là tự
 * đốt bộ đếm chống dò của BE.
 */
const fake = createFakeAuthAdapter();

const nonceRejected = () => ({
  data: { error: { code: 'AUTH_018', message: 'Mã nonce không hợp lệ' } },
  status: 401,
});
const loginOk = () => ({ data: { accessToken: 'a', refreshToken: 'r' }, status: 200 });

beforeAll(() => {
  apiClient.defaults.adapter = fake.adapter;
});

beforeEach(async () => {
  fake.reset();
  await purgeSession();
  let issued = 0;
  fake.responders.set('/auth/nonce', () => {
    issued += 1;
    return { data: { expiresIn: 120, nonce: `nonce-${issued}` }, status: 200 };
  });
});

describe('login()', () => {
  it('AUTH_018 lần đầu ⇒ lấy nonce mới, gửi lại, thành công (đúng 2 nonce, 2 lượt login)', async () => {
    let attempt = 0;
    fake.responders.set('/auth/login', () => (++attempt === 1 ? nonceRejected() : loginOk()));

    const session = await authService.login({ email: 'a@b.com', password: 'mat-khau' });

    expect(session.accessToken).toBe('a');
    expect(fake.countCallsTo('/auth/nonce')).toBe(2);
    expect(fake.countCallsTo('/auth/login')).toBe(2);
    // Lượt sau phải mang nonce MỚI, không phải nonce đã bị từ chối.
    const logins = fake.calls.filter((call) => call.url === '/auth/login');
    expect(logins.map((call) => (call.data as { nonce: string }).nonce)).toEqual([
      'nonce-1',
      'nonce-2',
    ]);
  });

  it('AUTH_018 HAI lần liền ⇒ dừng, ném lỗi (không thử lần ba)', async () => {
    fake.responders.set('/auth/login', nonceRejected);

    await expect(authService.login({ email: 'a@b.com', password: 'x' })).rejects.toBeInstanceOf(
      AxiosError,
    );

    expect(fake.countCallsTo('/auth/login')).toBe(2);
  });

  it('sai mật khẩu (401 khác AUTH_018) ⇒ KHÔNG thử lại', async () => {
    fake.responders.set('/auth/login', () => ({
      data: { error: { code: 'AUTH_002', message: 'Email hoặc mật khẩu không đúng' } },
      status: 401,
    }));

    await expect(authService.login({ email: 'a@b.com', password: 'sai' })).rejects.toBeInstanceOf(
      AxiosError,
    );

    expect(fake.countCallsTo('/auth/nonce')).toBe(1);
    expect(fake.countCallsTo('/auth/login')).toBe(1);
  });
});

describe('register()', () => {
  it('AUTH_018 lần đầu ⇒ thử lại một lần với nonce mới', async () => {
    let attempt = 0;
    fake.responders.set('/auth/register', () => (++attempt === 1 ? nonceRejected() : loginOk()));

    await authService.register({ email: 'c@d.com', name: 'C', password: 'Mat-khau1' });

    expect(fake.countCallsTo('/auth/register')).toBe(2);
    expect(fake.countCallsTo('/auth/nonce')).toBe(2);
  });
});
