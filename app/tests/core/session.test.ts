import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import {
  getRefreshToken,
  purgeSession,
  refreshSession,
  setAccessToken,
  setRefreshToken,
} from '@/core/api/session';
import { REFRESH_TOKEN_KEY } from '@/core/config/auth.config';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * Ba nhánh của `refreshSession()` — phần tinh tế nhất của tầng phiên.
 *
 * ⛔ Gộp `unavailable` vào `unauthenticated` là bug kinh điển, và trên di động
 * nó nặng hơn web nhiều: một cú chập sóng khi đi qua hầm gửi xe sẽ ĐĂNG XUẤT
 * người dùng và xoá biểu mẫu họ đang điền dở giữa công trường — trong khi phiên
 * thật ra vẫn còn hiệu lực. Test này chốt lại ranh giới đó.
 */

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

beforeEach(async () => {
  mockFetch.mockReset();
  jest.clearAllMocks();
  // Dọn cả hai kho + store. `refreshSession` tự nhả khoá single-flight khi
  // promise settle, nên không còn trạng thái nào khác cần dọn.
  await purgeSession();
});

describe('refreshSession — nhánh "ok"', () => {
  it('ghi access token mới vào store', async () => {
    await setRefreshToken('refresh-cu');
    mockFetch.mockResolvedValue(jsonResponse(200, { accessToken: 'access-moi' }));

    const outcome = await refreshSession();

    expect(outcome).toEqual({ status: 'ok', accessToken: 'access-moi' });
    expect(useAuthStore.getState().token).toBe('access-moi');
  });

  /**
   * Backend thường XOAY refresh token (dùng một lần rồi cấp cái mới). Quên ghi
   * cái mới là lỗi rất khó lần: phiên chạy tốt suốt lúc app còn mở, nhưng lần
   * mở app SAU thì token đã cũ và người dùng bị đăng xuất. Triệu chứng đọc ra là
   * "app hay tự đăng xuất", không ai nghĩ tới chỗ này.
   */
  it('ghi ĐÈ refresh token khi backend xoay vòng', async () => {
    await setRefreshToken('refresh-cu');
    mockFetch.mockResolvedValue(
      jsonResponse(200, { accessToken: 'access-moi', refreshToken: 'refresh-moi' }),
    );

    await refreshSession();

    expect(await getRefreshToken()).toBe('refresh-moi');
  });

  it('bóc được lớp bọc { data: ... } của backend .NET', async () => {
    await setRefreshToken('refresh-cu');
    mockFetch.mockResolvedValue(jsonResponse(200, { data: { access_token: 'access-moi' } }));

    expect(await refreshSession()).toEqual({ status: 'ok', accessToken: 'access-moi' });
  });
});

describe('refreshSession — nhánh "unauthenticated" (phiên chết thật)', () => {
  it.each([400, 401, 403])('HTTP %i ⇒ unauthenticated', async (status) => {
    await setRefreshToken('refresh-cu');
    mockFetch.mockResolvedValue(jsonResponse(status, {}));

    expect(await refreshSession()).toEqual({ status: 'unauthenticated' });
  });

  it('không có refresh token ⇒ unauthenticated, KHÔNG gọi mạng', async () => {
    expect(await refreshSession()).toEqual({ status: 'unauthenticated' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('refreshSession — nhánh "unavailable" (GIỮ phiên)', () => {
  it.each([500, 502, 503, 429])('HTTP %i ⇒ unavailable', async (status) => {
    await setRefreshToken('refresh-cu');
    mockFetch.mockResolvedValue(jsonResponse(status, {}));

    expect(await refreshSession()).toMatchObject({ status: 'unavailable' });
  });

  it('mất mạng ⇒ unavailable và refresh token VẪN CÒN trong kho khoá', async () => {
    await setRefreshToken('refresh-cu');
    mockFetch.mockRejectedValue(new Error('Network request failed'));

    expect(await refreshSession()).toMatchObject({ status: 'unavailable' });
    // Điều kiện then chốt: còn token thì lát nữa có sóng là phiên sống lại.
    expect(await getRefreshToken()).toBe('refresh-cu');
  });

  /**
   * 200 mà thiếu `accessToken` = backend sai hợp đồng. Vẫn KHÔNG giết phiên:
   * coi như hạ tầng lỗi để lần refresh sau còn cơ hội chữa.
   */
  it('200 nhưng thiếu accessToken ⇒ unavailable, không phải unauthenticated', async () => {
    await setRefreshToken('refresh-cu');
    mockFetch.mockResolvedValue(jsonResponse(200, { somethingElse: true }));

    expect(await refreshSession()).toMatchObject({ status: 'unavailable' });
    expect(await getRefreshToken()).toBe('refresh-cu');
  });
});

describe('single-flight', () => {
  /**
   * N request cùng ăn 401 chỉ được sinh ĐÚNG MỘT lời gọi refresh. Bắn song song
   * thì lời gọi thứ hai mang refresh token vừa bị vô hiệu, và backend coi đó là
   * dấu hiệu token bị đánh cắp — nó thu hồi CẢ phiên.
   */
  it('5 lời gọi đồng thời chỉ bắn MỘT request tới máy chủ', async () => {
    await setRefreshToken('refresh-cu');
    mockFetch.mockResolvedValue(jsonResponse(200, { accessToken: 'access-moi' }));

    const results = await Promise.all(Array.from({ length: 5 }, () => refreshSession()));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result).toEqual({ status: 'ok', accessToken: 'access-moi' });
    }
  });
});

describe('purgeSession', () => {
  it('xoá cả token trong bộ nhớ lẫn refresh token trong kho khoá', async () => {
    await setRefreshToken('refresh-cu');
    setAccessToken('access-cu');

    await purgeSession();

    expect(useAuthStore.getState().token).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });
});

describe('nơi cất refresh token', () => {
  /**
   * ⛔ Test này chốt quyết định bảo mật quan trọng nhất của base, và là chỗ dự
   * án tham chiếu `vci-sun-mobile` làm sai: refresh token PHẢI nằm trong kho
   * khoá của hệ điều hành (mã hoá), KHÔNG phải AsyncStorage (văn bản trần, đọc
   * được trên máy đã root hoặc qua bản sao lưu ADB).
   */
  it('dùng expo-secure-store, KHÔNG dùng AsyncStorage', async () => {
    await setRefreshToken('bi-mat');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      REFRESH_TOKEN_KEY,
      'bi-mat',
      expect.anything(),
    );
    // Không có lời ghi nào xuống AsyncStorage mang theo giá trị bí mật đó.
    for (const call of (AsyncStorage.setItem as jest.Mock).mock.calls) {
      expect(String(call[1])).not.toContain('bi-mat');
    }
  });
});
