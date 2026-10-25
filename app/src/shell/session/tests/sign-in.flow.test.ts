import { router } from 'expo-router';

import { queryClient } from '@/core/config/query-client';
import { connectSocket } from '@/core/socket';
import { redirectToPendingInvite } from '@/features/members/store/pending-invite';
import { useAppLockStore } from '@/shell/app-lock';
import { useAuthStore } from '@/shell/store/slices/auth';

import { redirectToPostLoginIntent } from '../post-login-intent';
import { completeSignIn } from '../sign-in';
import { wipeUserData } from '../wipe-user-data';

/**
 * `completeSignIn` — nơi đến sau đăng nhập, đăng nhập CHỒNG lên phiên đang sống (lớp phủ khoá)
 * và dọn dữ liệu khi đổi tài khoản. BIO-15 và luồng cơ bản: `sign-in.bio-15.test.ts`, `sign-in.test.ts`.
 */

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/core/socket', () => ({ connectSocket: jest.fn() }));
jest.mock('@/features/members/store/pending-invite', () => ({
  redirectToPendingInvite: jest.fn(),
}));
jest.mock('../post-login-intent', () => ({ redirectToPostLoginIntent: jest.fn() }));
jest.mock('../wipe-user-data', () => ({ wipeUserData: jest.fn() }));

const mockedReplace = jest.mocked(router.replace);
const mockedInvite = jest.mocked(redirectToPendingInvite);
const mockedIntent = jest.mocked(redirectToPostLoginIntent);
const mockedWipe = jest.mocked(wipeUserData);

const profile = (id: string) => ({
  email: `${id}@x.com`,
  id,
  name: id,
  permissions: [],
  roles: [],
});
const session = (id: string) => ({
  accessToken: `tok-${id}`,
  refreshToken: 'r',
  user: profile(id),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedInvite.mockResolvedValue(false);
  mockedIntent.mockResolvedValue(false);
  useAuthStore.getState().clearAuth();
  useAppLockStore.getState().unlock();
});

describe('nơi đến sau đăng nhập', () => {
  it('không có gì đang chờ ⇒ Trang chủ (replace)', async () => {
    await completeSignIn(session('a'), { method: 'PASSWORD' });

    expect(mockedReplace).toHaveBeenCalledWith('/');
  });

  it('link ngắn đang chờ (/live/{pin}…) ⇒ về đó, KHÔNG về Trang chủ', async () => {
    mockedIntent.mockResolvedValue(true);

    await completeSignIn(session('a'), { method: 'PASSWORD' });

    expect(mockedIntent).toHaveBeenCalledTimes(1);
    expect(mockedReplace).not.toHaveBeenCalled();
  });

  it('lời mời đang chờ thắng link ngắn', async () => {
    mockedInvite.mockResolvedValue(true);

    await completeSignIn(session('a'), { method: 'PASSWORD' });

    expect(mockedIntent).not.toHaveBeenCalled();
    expect(mockedReplace).not.toHaveBeenCalled();
  });
});

describe('đăng nhập chồng lên phiên đang sống (mở khoá ứng dụng)', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth({ token: 'tok-a', user: profile('a') });
    useAppLockStore.getState().lock();
  });

  it('CÙNG tài khoản + navigate:false ⇒ mở khoá, ĐỨNG NGUYÊN màn, không xoá cache, không dọn', async () => {
    const clearSpy = jest.spyOn(queryClient, 'clear');

    await completeSignIn(session('a'), { method: 'PASSWORD', navigate: false });

    expect(useAppLockStore.getState().locked).toBe(false);
    expect(mockedReplace).not.toHaveBeenCalled();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(mockedWipe).not.toHaveBeenCalled();
  });

  it('TÀI KHOẢN KHÁC ⇒ dọn dữ liệu người cũ TRƯỚC khi ghi phiên mới, nối lại socket, về Trang chủ', async () => {
    let userAtWipe: string | undefined;
    mockedWipe.mockImplementation(async () => {
      userAtWipe = useAuthStore.getState().user?.id;
    });

    await completeSignIn(session('b'), { method: 'PASSWORD', navigate: false });

    expect(userAtWipe).toBe('a'); // hồ sơ người cũ còn nguyên lúc dọn ⇒ dọn xảy ra trước setAuth
    expect(useAuthStore.getState().user?.id).toBe('b');
    expect(connectSocket).toHaveBeenCalledTimes(1);
    // Đổi tài khoản thì luôn về đầu, dù `navigate:false` — màn cũ thuộc về người trước.
    expect(mockedReplace).toHaveBeenCalledWith('/');
  });

  it('đăng nhập mới hoàn toàn (không có người trước) ⇒ KHÔNG dọn, không nối lại socket', async () => {
    useAuthStore.getState().clearAuth();

    await completeSignIn(session('c'), { method: 'PASSWORD' });

    expect(mockedWipe).not.toHaveBeenCalled();
    expect(connectSocket).not.toHaveBeenCalled();
  });
});
