import { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';

import { apiClient } from '@/core/api/client';
import { getRefreshToken, purgeSession, setAccessToken, setRefreshToken } from '@/core/api/session';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * 401 vì SAI MẬT KHẨU (mã `AUTH_001`) ≠ 401 vì token hết hạn.
 *
 * ⛔ Lỗi đã có thật: các lượt xác nhận mật khẩu của người ĐÃ đăng nhập (bật sinh trắc học,
 * xoá tài khoản) không mang `skipAuthRefresh`. BE trả 401 `AUTH_001` khi gõ sai mật khẩu →
 * interceptor tưởng token hết hạn → làm mới (xoay refresh token vô ích) → phát lại → 401 lần
 * hai → `purgeSession()`. Kết quả: gõ sai mật khẩu là BỊ ĐĂNG XUẤT.
 */

jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

let requestCount = 0;
let errorBody: unknown = {};

const adapter: AxiosAdapter = (config) => {
  requestCount += 1;
  const response = {
    config,
    data: errorBody,
    headers: {},
    request: {},
    status: 401,
    statusText: '',
  } as unknown as AxiosResponse;
  return Promise.reject(
    new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, {}, response),
  );
};

beforeAll(() => {
  apiClient.defaults.adapter = adapter;
});

beforeEach(async () => {
  requestCount = 0;
  errorBody = {};
  mockFetch.mockReset();
  await purgeSession();
  await setRefreshToken('refresh-cu');
  setAccessToken('access-cu');
});

it('401 AUTH_001 (sai mật khẩu) ⇒ KHÔNG làm mới token, KHÔNG dọn phiên, lỗi nổi lên cho form', async () => {
  errorBody = { error: { code: 'AUTH_001', message: 'Email hoặc mật khẩu không đúng' } };

  await expect(
    apiClient.post('/auth/biometric/enroll', { password: 'sai' }, { skipErrorToast: true }),
  ).rejects.toBeInstanceOf(AxiosError);

  expect(mockFetch).not.toHaveBeenCalled(); // không có lượt refresh nào
  expect(requestCount).toBe(1); // không phát lại
  expect(useAuthStore.getState().token).toBe('access-cu');
  expect(await getRefreshToken()).toBe('refresh-cu');
});

it('401 mã token (AUTH_003 hết hạn) VẪN đi đường làm mới như cũ', async () => {
  errorBody = { error: { code: 'AUTH_003', message: 'Token đã hết hạn' } };
  mockFetch.mockResolvedValue({
    json: async () => ({ accessToken: 'access-moi' }),
    ok: true,
    status: 200,
  } as Response);

  // Lượt phát lại (adapter luôn 401) ⇒ kết thúc bằng dọn phiên — nhưng điều cần chốt là
  // refresh ĐÃ được thử một lần, tức là ranh giới `AUTH_001` không nuốt nhầm mã token.
  await expect(apiClient.get('/reports', { skipErrorToast: true })).rejects.toBeInstanceOf(
    AxiosError,
  );

  expect(mockFetch).toHaveBeenCalledTimes(1);
});
