import {
  getRefreshToken,
  purgeSession,
  refreshSession,
  setAccessToken,
  setRefreshToken,
} from '@/core/api/session';
import { __resetSessionEndListenersForTests, onSessionEnded } from '@/core/api/session-end';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * `purgeSession()` là điểm nối DUY NHẤT của cả bốn đường phiên chết (đăng xuất, refresh trả
 * 4xx, request 401 không cứu được, socket bị từ chối). Bộ test này chốt hai việc:
 *   1. Mọi đường đều báo `onSessionEnded` — để vỏ ứng dụng dọn dữ liệu người dùng.
 *   2. Một lượt refresh đang bay lúc phiên bị dọn KHÔNG được hồi sinh phiên đó.
 */

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

beforeEach(async () => {
  mockFetch.mockReset();
  __resetSessionEndListenersForTests();
  await purgeSession();
});

afterAll(() => __resetSessionEndListenersForTests());

describe('purgeSession → onSessionEnded', () => {
  it('báo id người dùng của phiên vừa chết, SAU khi token đã bị xoá', async () => {
    useAuthStore.getState().setAuth({
      token: 'access-cu',
      user: { email: 'a@b.com', id: 'user-1', name: 'A', permissions: [], roles: [] },
    });
    await setRefreshToken('refresh-cu');
    const seen: { token: string | null; refresh: string | null; userId: string | null }[] = [];
    onSessionEnded(async ({ userId }) => {
      seen.push({
        refresh: await getRefreshToken(),
        token: useAuthStore.getState().token,
        userId,
      });
    });

    await purgeSession();

    // Người nghe chạy khi phiên đã sạch: dọn dữ liệu trong lúc token còn sống là mở khe cho
    // request cuối cùng của người cũ chạy với store đã rỗng.
    expect(seen).toEqual([{ refresh: null, token: null, userId: 'user-1' }]);
  });

  it('một người nghe ném lỗi KHÔNG chặn người nghe khác và KHÔNG làm purgeSession ném', async () => {
    const after = jest.fn();
    onSessionEnded(() => {
      throw new Error('hỏng');
    });
    onSessionEnded(after);

    await expect(purgeSession()).resolves.toBeUndefined();

    expect(after).toHaveBeenCalledTimes(1);
  });

  it('nhiều lời gọi dồn dập dùng chung MỘT đợt dọn', async () => {
    const listener = jest.fn(async () => undefined);
    onSessionEnded(listener);

    await Promise.all([purgeSession(), purgeSession(), purgeSession()]);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('huỷ đăng ký thì không còn được gọi', async () => {
    const listener = jest.fn();
    const off = onSessionEnded(listener);
    off();

    await purgeSession();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('refresh đang bay lúc phiên bị dọn', () => {
  it('BỎ kết quả: không ghi lại refresh token, không hồi sinh access token', async () => {
    await setRefreshToken('refresh-cu');
    let release: (response: Response) => void = () => undefined;
    mockFetch.mockReturnValue(new Promise<Response>((resolve) => (release = resolve)));

    const pending = refreshSession();
    // Người dùng bấm Đăng xuất ngay lúc máy chủ chưa trả lời.
    setAccessToken('access-cu');
    await purgeSession();
    release(jsonResponse(200, { accessToken: 'access-moi', refreshToken: 'refresh-moi' }));

    // `unavailable` chứ không `unauthenticated`: caller không được `purgeSession()` lần nữa
    // (có thể đã có phiên MỚI của người khác).
    expect(await pending).toMatchObject({ status: 'unavailable' });
    expect(await getRefreshToken()).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().status).toBe('anonymous');
  });
});
