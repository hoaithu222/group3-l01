import { authService } from '@/core/api/auth';
import { useBiometricStore } from '@/shell/store/slices/biometric';
import { useAppLockStore } from '@/shell/app-lock';
import { useAuthStore } from '@/shell/store/slices/auth';

import { completeSignIn } from '../sign-in';

/**
 * BIO-15: đăng nhập bằng tài khoản KHÁC tài khoản đang gắn sinh trắc học trên
 * máy phải gỡ gắn CŨ, dù lượt đăng nhập đó đi bằng MẬT KHẨU chứ không phải
 * sinh trắc học. Luồng cơ bản của `completeSignIn` nằm ở `sign-in.test.ts` —
 * tách để mỗi file dưới trần 150 dòng.
 */

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: { ...actual.authService, me: jest.fn(), revokeBiometricCredential: jest.fn() },
  };
});

const mockedRevoke = authService.revokeBiometricCredential as jest.MockedFunction<
  typeof authService.revokeBiometricCredential
>;

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

function user(id: string, email: string) {
  return { email, id, name: 'Người dùng', permissions: [], roles: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.getState().clearAuth();
  useBiometricStore.setState({ binding: null, hasHydrated: true });
  useAppLockStore.getState().unlock();
});

it('đăng nhập bằng tài khoản KHÁC tài khoản đang gắn ⇒ gỡ gắn cũ + DELETE credential(reason=ACCOUNT_SWITCHED)', async () => {
  useBiometricStore.setState({
    binding: {
      credentialId: 'cred-cu',
      email: 'cu@x.com',
      expiresAt: FUTURE,
      kind: 'FINGERPRINT',
      userId: 'user-cu',
    },
    hasHydrated: true,
  });
  mockedRevoke.mockResolvedValue(undefined);

  await completeSignIn(
    { accessToken: 'a', refreshToken: 'r', user: user('user-moi', 'moi@x.com') },
    { method: 'PASSWORD' },
  );

  expect(useBiometricStore.getState().binding).toBeNull();
  expect(mockedRevoke).toHaveBeenCalledWith('cred-cu', 'ACCOUNT_SWITCHED');
});

it('đăng nhập lại CHÍNH tài khoản đang gắn ⇒ GIỮ NGUYÊN gắn kết, không gọi DELETE', async () => {
  const binding = {
    credentialId: 'cred-1',
    email: 'a@b.com',
    expiresAt: FUTURE,
    kind: 'FINGERPRINT' as const,
    userId: 'user-1',
  };
  useBiometricStore.setState({ binding, hasHydrated: true });

  await completeSignIn(
    { accessToken: 'a', refreshToken: 'r', user: user('user-1', 'a@b.com') },
    { method: 'BIOMETRIC' },
  );

  expect(useBiometricStore.getState().binding).toEqual(binding);
  expect(mockedRevoke).not.toHaveBeenCalled();
});

it('lỗi mạng lúc báo BE thu hồi KHÔNG chặn việc gỡ gắn CỤC BỘ', async () => {
  useBiometricStore.setState({
    binding: {
      credentialId: 'cred-cu',
      email: 'cu@x.com',
      expiresAt: FUTURE,
      kind: 'FINGERPRINT',
      userId: 'user-cu',
    },
    hasHydrated: true,
  });
  mockedRevoke.mockRejectedValue(new Error('mất mạng'));

  await expect(
    completeSignIn(
      { accessToken: 'a', refreshToken: 'r', user: user('user-moi', 'moi@x.com') },
      { method: 'PASSWORD' },
    ),
  ).resolves.toBeUndefined();

  expect(useBiometricStore.getState().binding).toBeNull();
});

it('chưa từng gắn kết trên máy ⇒ không gọi revoke, đăng nhập bình thường', async () => {
  await completeSignIn(
    { accessToken: 'a', refreshToken: 'r', user: user('user-1', 'a@b.com') },
    { method: 'PASSWORD' },
  );

  expect(mockedRevoke).not.toHaveBeenCalled();
  expect(useAuthStore.getState().user?.id).toBe('user-1');
});
