import { AxiosError } from 'axios';

import { apiClient } from '@/core/api/client';
import { getAccessToken, purgeSession } from '@/core/api/session';

import { authService } from '../auth.service';
import { createFakeAuthAdapter } from './fake-auth-adapter';

/**
 * `POST /auth/firebase-login` — body CHỈ `{ idToken, nonce }` (BE `.strict()`: thừa trường là 400), nonce MỚI mỗi lượt gửi,
 * `AUTH_018` thử lại đúng một lần với CHÍNH `idToken` đó; lỗi khác (`AUTH_022` token cũ, `AUTH_023` email chưa xác minh) KHÔNG thử lại.
 */
const fake = createFakeAuthAdapter();

const LOGIN_PATH = '/auth/firebase-login';
const ok = () => ({
  data: { accessToken: 'access-1', refreshToken: 'refresh-1', user: { id: 'u1', email: 'a@b.com' } },
  status: 200,
});
const rejected = (status: number, code: string) => () => ({
  data: { error: { code, message: 'msg' } },
  status,
});

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

describe('firebaseLogin()', () => {
  it('gửi đúng { idToken, nonce } tới /auth/firebase-login, chuẩn hoá phiên và ghi vào kho phiên', async () => {
    fake.responders.set(LOGIN_PATH, ok);

    const session = await authService.firebaseLogin({ idToken: 'firebase-id-token' });

    expect(session).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    expect(session.user?.id).toBe('u1');
    const call = fake.calls.find((c) => c.url === LOGIN_PATH);
    expect(call?.method).toBe('post');
    expect(call?.data).toEqual({ idToken: 'firebase-id-token', nonce: 'nonce-1' });
    expect(getAccessToken()).toBe('access-1');
  });

  it('AUTH_018 lần đầu ⇒ lấy nonce mới và gửi lại CHÍNH idToken đó, đúng một lần', async () => {
    let attempt = 0;
    fake.responders.set(LOGIN_PATH, () => (++attempt === 1 ? rejected(401, 'AUTH_018')() : ok()));

    await authService.firebaseLogin({ idToken: 'firebase-id-token' });

    const bodies = fake.calls.filter((c) => c.url === LOGIN_PATH).map((c) => c.data);
    expect(bodies).toEqual([
      { idToken: 'firebase-id-token', nonce: 'nonce-1' },
      { idToken: 'firebase-id-token', nonce: 'nonce-2' },
    ]);
  });

  it.each([
    [401, 'AUTH_022'],
    [401, 'AUTH_023'],
    [403, 'AUTH_012'],
    [503, 'SYS_503'],
  ])('%s %s ⇒ ném lỗi, KHÔNG thử lại (không đốt bộ đếm limiter của BE)', async (status, code) => {
    fake.responders.set(LOGIN_PATH, rejected(status, code));

    await expect(authService.firebaseLogin({ idToken: 'firebase-id-token' })).rejects.toBeInstanceOf(
      AxiosError,
    );

    expect(fake.countCallsTo('/auth/nonce')).toBe(1);
    expect(fake.countCallsTo(LOGIN_PATH)).toBe(1);
    expect(getAccessToken()).toBeNull();
  });
});
