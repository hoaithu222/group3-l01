import { purgeSession, setAccessToken, setRefreshToken } from '@/core/api/session';
import { ensureFreshAccessToken, isAccessTokenFresh } from '@/core/api/session.fresh';

/**
 * `ensureFreshAccessToken` — làm mới TRƯỚC những lượt gọi không được đi qua interceptor 401
 * (đăng xuất, đổi mật khẩu). Chốt: không gọi mạng khi token còn hạn; hết hạn thì làm mới đúng
 * MỘT lần; mất sóng thì trả `false` chứ không treo.
 */

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

/** JWT giả — chỉ payload có nghĩa (`decodeJwtPayload` không kiểm chữ ký). */
function jwtExpiringIn(seconds: number): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }),
  ).toString('base64url');
  return `header.${payload}.signature`;
}

beforeEach(async () => {
  mockFetch.mockReset();
  await purgeSession();
});

describe('isAccessTokenFresh', () => {
  it('null ⇒ không còn hạn', () => {
    expect(isAccessTokenFresh(null)).toBe(false);
  });

  it('còn hơn 60 giây ⇒ còn hạn; dưới 60 giây (biên an toàn) ⇒ coi như hết', () => {
    expect(isAccessTokenFresh(jwtExpiringIn(600))).toBe(true);
    expect(isAccessTokenFresh(jwtExpiringIn(30))).toBe(false);
    expect(isAccessTokenFresh(jwtExpiringIn(-5))).toBe(false);
  });

  it('không đọc được `exp` ⇒ coi như còn hạn (giống auth.store.isAuthenticated)', () => {
    expect(isAccessTokenFresh('token-khong-phai-jwt')).toBe(true);
  });
});

describe('ensureFreshAccessToken', () => {
  it('token còn hạn ⇒ true và KHÔNG gọi mạng', async () => {
    setAccessToken(jwtExpiringIn(600));

    expect(await ensureFreshAccessToken()).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('token hết hạn ⇒ làm mới đúng một lần và trả true', async () => {
    await setRefreshToken('refresh-cu');
    setAccessToken(jwtExpiringIn(-30));
    mockFetch.mockResolvedValue(jsonResponse(200, { accessToken: jwtExpiringIn(900) }));

    expect(await ensureFreshAccessToken()).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('mất sóng ⇒ false (không treo, không ném)', async () => {
    await setRefreshToken('refresh-cu');
    setAccessToken(jwtExpiringIn(-30));
    mockFetch.mockRejectedValue(new Error('Network request failed'));

    expect(await ensureFreshAccessToken()).toBe(false);
  });

  it('máy chủ im lặng quá hạn chờ ⇒ false đúng hạn, không chờ vô hạn', async () => {
    jest.useFakeTimers();
    try {
      await setRefreshToken('refresh-cu');
      setAccessToken(jwtExpiringIn(-30));
      mockFetch.mockReturnValue(new Promise<Response>(() => undefined));

      const result = ensureFreshAccessToken(1000);
      await jest.advanceTimersByTimeAsync(1000);

      expect(await result).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
