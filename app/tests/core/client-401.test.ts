import { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';

import { apiClient } from '@/core/api/client';
import { getRefreshToken, setAccessToken, setRefreshToken, purgeSession } from '@/core/api/session';
import { appConfig } from '@/core/config/env.config';
import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * 401 KHÔNG được phép biến mất — dù luồng refresh có bật hay không.
 *
 * ⛔ Đây là hố đen đã có thật trong base: nhánh 401 của interceptor bọc trong
 * `appConfig.enableRefreshToken`, còn khối toast lại loại trừ `status !== 401`.
 * Đặt `EXPO_PUBLIC_ENABLE_REFRESH_TOKEN=false` (đúng như `.env.example` hướng
 * dẫn khi BE chưa có endpoint refresh) là mọi 401 rơi qua CẢ HAI cửa: không dọn
 * phiên, không toast, không điều hướng. Store vẫn `authenticated` nên guard ở
 * `app/(app)/_layout.tsx` cũng không kích hoạt — người dùng ngồi trên màn hình
 * trong khi mọi request hỏng im lặng, vĩnh viễn.
 *
 * Ba ranh giới mà bộ test này chốt lại:
 *   1. Không cứu được phiên ⇒ PHẢI dọn phiên + toast (cờ tắt, hoặc `__retried`).
 *   2. `skipAuthRefresh` (lượt đăng nhập) ⇒ ⛔ TUYỆT ĐỐI không dọn phiên —
 *      401 ở đó là sai mật khẩu, không phải phiên chết.
 *   3. Refresh hỏng vì MẤT SÓNG ⇒ toast, nhưng GIỮ phiên (điều cấm số 6).
 */

jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const mockedToast = jest.mocked(showToast);

/**
 * Cho phép đổi cờ trong lúc chạy test.
 *
 * `appConfig` khai `as const` nên chỉ READONLY ở tầng KIỂU — đối tượng thật vẫn
 * ghi được. Ép qua đây thay vì `jest.mock` cả module: mock module thì phải chép
 * lại đủ mười mấy trường và mỗi lần base thêm cờ mới là test lệch âm thầm.
 */
const mutableConfig = appConfig as unknown as { enableRefreshToken: boolean };
const DEFAULT_ENABLE_REFRESH = appConfig.enableRefreshToken;

/** Mã HTTP mà adapter giả sẽ trả cho từng lượt gọi, theo đúng thứ tự. */
let statusQueue: number[] = [];
/** Số lần adapter được gọi — đếm lượt phát lại request gốc. */
let requestCount = 0;

const fakeAdapter: AxiosAdapter = (config) => {
  requestCount += 1;
  const status = statusQueue.shift() ?? 200;
  const response = {
    config,
    data: {},
    headers: {},
    request: {},
    status,
    statusText: '',
  } as unknown as AxiosResponse;

  // ⚠️ Adapter tự phải reject: `settle()` nằm trong các adapter dựng sẵn của
  // axios, không nằm ở tầng `dispatchRequest`. Resolve một response 401 thì
  // interceptor lỗi KHÔNG bao giờ chạy và test xanh giả.
  if (status >= 200 && status < 300) return Promise.resolve(response);
  return Promise.reject(
    new AxiosError(
      `Request failed with status code ${String(status)}`,
      'ERR_BAD_REQUEST',
      config,
      {},
      response,
    ),
  );
};

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

/** Phản hồi của endpoint refresh (gọi bằng `fetch` trần — xem `session.ts`). */
const refreshResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

/** Dựng một phiên đang sống: token trong bộ nhớ + refresh token trong kho khoá. */
async function givenLiveSession(): Promise<void> {
  await setRefreshToken('refresh-cu');
  setAccessToken('access-cu');
}

beforeAll(() => {
  apiClient.defaults.adapter = fakeAdapter;
});

beforeEach(async () => {
  statusQueue = [];
  requestCount = 0;
  mockFetch.mockReset();
  mockedToast.mockClear();
  mutableConfig.enableRefreshToken = DEFAULT_ENABLE_REFRESH;
  await purgeSession();
});

afterAll(() => {
  mutableConfig.enableRefreshToken = DEFAULT_ENABLE_REFRESH;
});

describe('401 khi ENABLE_REFRESH_TOKEN=false — 401 là đăng xuất luôn', () => {
  beforeEach(() => {
    mutableConfig.enableRefreshToken = false;
  });

  it('dọn SẠCH phiên để guard đưa về màn đăng nhập', async () => {
    await givenLiveSession();
    statusQueue = [401];

    await expect(apiClient.get('/reports')).rejects.toBeInstanceOf(AxiosError);

    // Điều kiện then chốt: store không còn `authenticated` thì guard ở
    // `app/(app)/_layout.tsx` mới chuyển màn. Còn `authenticated` là hố đen.
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().status).toBe('anonymous');
    // Refresh token cũng phải đi: giữ lại là lần mở app sau tự "đăng nhập" bằng
    // một token mà máy chủ vừa từ chối.
    expect(await getRefreshToken()).toBeNull();
  });

  it('vẫn TOAST cho người dùng biết vì sao màn hình trống', async () => {
    await givenLiveSession();
    statusQueue = [401];

    await expect(apiClient.get('/reports')).rejects.toBeInstanceOf(AxiosError);

    expect(mockedToast).toHaveBeenCalledTimes(1);
    expect(mockedToast).toHaveBeenCalledWith('error', 'Bạn cần đăng nhập để tiếp tục');
  });

  it('KHÔNG gọi endpoint refresh — cờ tắt nghĩa là backend chưa có endpoint đó', async () => {
    await givenLiveSession();
    statusQueue = [401];

    await expect(apiClient.get('/reports')).rejects.toBeInstanceOf(AxiosError);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(requestCount).toBe(1);
  });

  /**
   * ⛔ Ranh giới quan trọng nhất của file này. Lượt đăng nhập mang
   * `skipAuthRefresh` và 401 ở đó = SAI MẬT KHẨU. Dọn phiên là đá người dùng
   * ra ngay giữa lúc họ đang gõ lại mật khẩu.
   */
  it('401 của lượt có skipAuthRefresh KHÔNG dọn phiên', async () => {
    await givenLiveSession();
    statusQueue = [401];

    await expect(
      apiClient.post('/auth/login', {}, { skipAuthRefresh: true, skipErrorToast: true }),
    ).rejects.toBeInstanceOf(AxiosError);

    expect(useAuthStore.getState().token).toBe('access-cu');
    expect(await getRefreshToken()).toBe('refresh-cu');
    // `skipErrorToast` của màn đăng nhập vẫn được tôn trọng.
    expect(mockedToast).not.toHaveBeenCalled();
  });
});

describe('401 khi ENABLE_REFRESH_TOKEN=true', () => {
  beforeEach(() => {
    mutableConfig.enableRefreshToken = true;
  });

  it('refresh được ⇒ phát lại request gốc, KHÔNG toast và KHÔNG dọn phiên', async () => {
    await givenLiveSession();
    statusQueue = [401, 200];
    mockFetch.mockResolvedValue(refreshResponse(200, { accessToken: 'access-moi' }));

    const response = await apiClient.get('/reports');

    expect(response.status).toBe(200);
    expect(requestCount).toBe(2);
    expect(mockedToast).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBe('access-moi');
  });

  /**
   * Cùng một hố đen, lối vào khác: refresh chạy tốt nhưng lượt PHÁT LẠI vẫn ăn
   * 401 (token mới sai audience/scope, hoặc backend vừa thu hồi phiên). Lúc đó
   * `__retried` đã bật nên không được refresh thêm vòng nào nữa — và cũng
   * không được im lặng.
   */
  it('phát lại VẪN 401 (__retried đã bật) ⇒ dọn phiên + toast, không refresh thêm', async () => {
    await givenLiveSession();
    statusQueue = [401, 401];
    mockFetch.mockResolvedValue(refreshResponse(200, { accessToken: 'access-moi' }));

    await expect(apiClient.get('/reports')).rejects.toBeInstanceOf(AxiosError);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(mockedToast).toHaveBeenCalledTimes(1);
  });

  /**
   * ⛔ Mất sóng ≠ phiên chết (điều cấm số 6 của base). Một cú chập sóng khi đi
   * qua hầm gửi xe KHÔNG được đăng xuất người dùng — nhưng vẫn phải nói ra,
   * nếu không màn hình trống mà không ai biết vì sao.
   */
  it('refresh hỏng vì MẤT SÓNG ⇒ toast nhưng GIỮ nguyên refresh token', async () => {
    await givenLiveSession();
    statusQueue = [401];
    mockFetch.mockRejectedValue(new Error('Network request failed'));

    await expect(apiClient.get('/reports')).rejects.toBeInstanceOf(AxiosError);

    expect(await getRefreshToken()).toBe('refresh-cu');
    expect(mockedToast).toHaveBeenCalledTimes(1);
  });

  it('máy chủ nói phiên đã chết (refresh trả 401) ⇒ dọn phiên + toast', async () => {
    await givenLiveSession();
    statusQueue = [401];
    mockFetch.mockResolvedValue(refreshResponse(401, {}));

    await expect(apiClient.get('/reports')).rejects.toBeInstanceOf(AxiosError);

    expect(useAuthStore.getState().token).toBeNull();
    expect(await getRefreshToken()).toBeNull();
    expect(mockedToast).toHaveBeenCalledTimes(1);
  });
});

describe('lỗi KHÔNG phải 401 — hành vi cũ giữ nguyên', () => {
  it('500 vẫn toast đúng một lần và KHÔNG đụng tới phiên', async () => {
    await givenLiveSession();
    statusQueue = [500];

    await expect(apiClient.get('/reports')).rejects.toBeInstanceOf(AxiosError);

    expect(mockedToast).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().token).toBe('access-cu');
    expect(await getRefreshToken()).toBe('refresh-cu');
  });

  it('skipErrorToast tắt toast như trước', async () => {
    statusQueue = [500];

    await expect(apiClient.get('/reports', { skipErrorToast: true })).rejects.toBeInstanceOf(
      AxiosError,
    );

    expect(mockedToast).not.toHaveBeenCalled();
  });
});
