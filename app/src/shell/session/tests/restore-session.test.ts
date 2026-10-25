import { authService } from '@/core/api/auth';
import { getRefreshToken, purgeSession, setRefreshToken } from '@/core/api/session';
import { __resetSessionEndListenersForTests, onSessionEnded } from '@/core/api/session-end';
import { redirectToPendingInvite } from '@/features/members/store/pending-invite';
import { useAuthStore } from '@/shell/store/slices/auth';

import { applyColdStartLock } from '../apply-cold-start-lock';
import { restoreSession } from '../restore-session';
import { rememberInitialDeepLink } from '../use-post-login-intent-capture';

/**
 * Khôi phục phiên lúc MỞ APP — điều cấm số 6: `unavailable` (mất sóng) ≠ `unauthenticated`
 * (phiên chết). Nhánh chết phải DỌN (refresh token chết + hồ sơ persist + dữ liệu người dùng);
 * nhánh mất sóng phải GIỮ NGUYÊN mọi thứ để lần mở sau vào thẳng.
 */

jest.mock('@/core/api/auth', () => ({ authService: { me: jest.fn() } }));
jest.mock('@/features/members/store/pending-invite', () => ({
  redirectToPendingInvite: jest.fn(),
}));
jest.mock('../apply-cold-start-lock', () => ({ applyColdStartLock: jest.fn() }));
jest.mock('../use-post-login-intent-capture', () => ({ rememberInitialDeepLink: jest.fn() }));

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;
const mockedMe = jest.mocked(authService.me);
const purged = jest.fn();

const user = { email: 'a@b.com', id: 'user-1', name: 'A', permissions: [], roles: [] };

beforeEach(async () => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  __resetSessionEndListenersForTests();
  await purgeSession();
  onSessionEnded(purged);
});

afterAll(() => __resetSessionEndListenersForTests());

describe('phiên CHẾT thật (unauthenticated)', () => {
  it('máy chủ nói 401 ⇒ dọn: refresh token chết, hồ sơ persist, dữ liệu người dùng', async () => {
    await setRefreshToken('refresh-chet');
    useAuthStore.getState().setAuth({ user });
    mockFetch.mockResolvedValue({ json: async () => ({}), ok: false, status: 401 } as Response);

    expect(await restoreSession()).toBe('anonymous');

    expect(await getRefreshToken()).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(purged).toHaveBeenCalledTimes(1);
    expect(rememberInitialDeepLink).toHaveBeenCalledTimes(1);
  });

  it('còn hồ sơ persist nhưng KHÔNG còn refresh token ⇒ vẫn dọn (hồ sơ mồ côi)', async () => {
    useAuthStore.getState().setAuth({ user });
    useAuthStore.setState({ token: null });

    expect(await restoreSession()).toBe('anonymous');

    expect(useAuthStore.getState().user).toBeNull();
    expect(purged).toHaveBeenCalledTimes(1);
  });

  it('chưa từng có phiên (cài mới/đã đăng xuất) ⇒ KHÔNG dọn — mỗi lần mở app không đáng', async () => {
    expect(await restoreSession()).toBe('anonymous');

    expect(purged).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(rememberInitialDeepLink).toHaveBeenCalledTimes(1);
  });
});

describe('MẤT SÓNG (unavailable) — điều cấm số 6', () => {
  it('GIỮ refresh token và hồ sơ, KHÔNG dọn, về anonymous để guard thôi chờ', async () => {
    await setRefreshToken('refresh-tot');
    useAuthStore.getState().setAuth({ user });
    mockFetch.mockRejectedValue(new Error('Network request failed'));

    expect(await restoreSession()).toBe('unavailable');

    expect(await getRefreshToken()).toBe('refresh-tot');
    expect(useAuthStore.getState().user?.id).toBe('user-1');
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(purged).not.toHaveBeenCalled();
    expect(rememberInitialDeepLink).toHaveBeenCalledTimes(1);
  });
});

describe('khôi phục được', () => {
  beforeEach(async () => {
    await setRefreshToken('refresh-tot');
    mockFetch.mockResolvedValue({
      json: async () => ({ accessToken: 'tok' }),
      ok: true,
      status: 200,
    } as Response);
  });

  it('lấy hồ sơ với TRẦN thời gian ngắn, áp khoá ứng dụng, chuyển tới lời mời đang chờ', async () => {
    mockedMe.mockResolvedValue(user);

    expect(await restoreSession()).toBe('restored');

    expect(mockedMe).toHaveBeenCalledWith({ timeoutMs: 8000 });
    expect(useAuthStore.getState().user?.id).toBe('user-1');
    expect(applyColdStartLock).toHaveBeenCalledTimes(1);
    expect(redirectToPendingInvite).toHaveBeenCalledTimes(1);
    // Phiên còn sống ⇒ Expo Router tự mở link khởi động; nhớ lại là sinh điều hướng đôi.
    expect(rememberInitialDeepLink).not.toHaveBeenCalled();
  });

  it('hồ sơ lấy hỏng ⇒ KHÔNG đá người dùng ra: token vẫn tốt, status authenticated', async () => {
    mockedMe.mockRejectedValue(new Error('timeout'));

    expect(await restoreSession()).toBe('restored');

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().token).toBe('tok');
  });
});
