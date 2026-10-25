import { router } from 'expo-router';

import { authService } from '@/core/api/auth';
import { queryClient } from '@/core/config/query-client';
import { useAppLockStore } from '@/shell/app-lock';
import { useAuthStore } from '@/shell/store/slices/auth';
import { useBiometricStore } from '@/shell/store/slices/biometric';

import { completeSignIn } from '../sign-in';

/**
 * `completeSignIn` — luồng CƠ BẢN (xoá cache, ghi phiên, gỡ khoá, điều hướng).
 * BIO-15 (đối chiếu gắn kết sinh trắc học khi đổi tài khoản) nằm ở
 * `sign-in.bio-15.test.ts` — tách để mỗi file dưới trần 150 dòng.
 */

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

jest.mock('@/core/api/auth', () => {
  const actual = jest.requireActual('@/core/api/auth');
  return {
    ...actual,
    authService: { ...actual.authService, me: jest.fn(), revokeBiometricCredential: jest.fn() },
  };
});

const mockedMe = authService.me as jest.MockedFunction<typeof authService.me>;
const mockedReplace = router.replace as jest.MockedFunction<typeof router.replace>;

function user(id: string, email: string) {
  return { email, id, name: 'Người dùng', permissions: [], roles: [] };
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.getState().clearAuth();
  useBiometricStore.setState({ binding: null, hasHydrated: true });
  useAppLockStore.getState().unlock();
});

describe('luồng cơ bản', () => {
  it('xoá cache React Query, ghi phiên, gỡ khoá ứng dụng, điều hướng về HOME', async () => {
    const clearSpy = jest.spyOn(queryClient, 'clear');
    useAppLockStore.getState().lock();

    await completeSignIn(
      { accessToken: 'access-1', refreshToken: 'refresh-1', user: user('user-1', 'a@b.com') },
      { method: 'PASSWORD' },
    );

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().token).toBe('access-1');
    expect(useAuthStore.getState().user?.id).toBe('user-1');
    expect(useAppLockStore.getState().locked).toBe(false);
    expect(mockedReplace).toHaveBeenCalledWith('/');
  });

  it('session.user null ⇒ tự lấy hồ sơ qua authService.me()', async () => {
    mockedMe.mockResolvedValue(user('user-2', 'x@y.com'));

    await completeSignIn({ accessToken: 'a', refreshToken: null, user: null }, { method: 'PASSWORD' });

    expect(mockedMe).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user?.id).toBe('user-2');
  });

  it('lấy hồ sơ hỏng ⇒ vẫn hoàn tất đăng nhập (token vẫn hợp lệ)', async () => {
    mockedMe.mockRejectedValue(new Error('mạng chập chờn'));

    await completeSignIn({ accessToken: 'a', refreshToken: null, user: null }, { method: 'PASSWORD' });

    expect(useAuthStore.getState().token).toBe('a');
    expect(useAuthStore.getState().user).toBeNull();
    expect(mockedReplace).toHaveBeenCalledWith('/');
  });
});
