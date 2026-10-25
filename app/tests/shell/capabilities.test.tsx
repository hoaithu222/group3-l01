import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { apiClient } from '@/core/api';
import type { Capabilities } from '@/core/capabilities';
import { useCapabilities, useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

/**
 * `useCapabilities()` / `useFeature()` — cờ phân hệ đọc từ `GET /capabilities`.
 *
 * Mock ở tầng `apiClient.get` (không mock cả `capabilitiesService`) để bài
 * test còn đi qua `unwrapData()` thật — đúng lớp bọc `{ success, data }` mà
 * backend trả (`docs/plan/config-be.md` B8), nên nếu ai lỡ đổi
 * `capabilitiesService` để đọc sai trường thì test này đỏ.
 */
jest.mock('@/core/api', () => {
  const actual = jest.requireActual('@/core/api');
  return { ...actual, apiClient: { ...actual.apiClient, get: jest.fn() } };
});

/**
 * ⚠️ Ép `authEnabled = true` cho CẢ FILE.
 *
 * `.env` của repo đặt `EXPO_PUBLIC_AUTH_ENABLED=true`, nhưng biến đó chỉ được
 * NẠP lúc `npx expo …` chạy (Metro thay chuỗi lúc build) — chạy thẳng `jest`
 * thì `process.env.EXPO_PUBLIC_AUTH_ENABLED` rỗng, và mặc định của
 * `env.config.ts` là `false`. Ép ở đây để test đúng NHÁNH sẽ chạy trên máy
 * thật (dự án đã bật xác thực), thay vì nhánh "cờ tắt" chỉ có ở base mới dựng.
 */
jest.mock('@/core/config/env.config', () => {
  const actual = jest.requireActual('@/core/config/env.config');
  return { ...actual, appConfig: { ...actual.appConfig, authEnabled: true } };
});

const mockedGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;

const CAPABILITIES: Capabilities = {
  version: '1.0.0',
  features: {
    communication: { enabled: true, available: true },
    study: { enabled: false, available: false },
  },
  limits: {},
  upload: { maxFileBytes: 25 * 1024 * 1024, allowedMime: [], signedUrlTtlSeconds: 60 },
};

/** Bọc `{ success, data }` giống hệt `ResponseUtils.success` phía backend. */
function envelopeResponse(data: Capabilities) {
  return { data: { success: true, message: 'Thành công', data } };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // `useCapabilities` chỉ `enabled` khi đã đăng nhập lúc `appConfig.authEnabled`
  // bật — đặt `authenticated` ở đây để test không phụ thuộc giá trị của cờ đó.
  useAuthStore.getState().setStatus('authenticated');
});

describe('useFeature', () => {
  it('false khi cờ tắt ở backend', async () => {
    mockedGet.mockResolvedValue(envelopeResponse(CAPABILITIES) as never);

    const { result } = await renderHook(() => useFeature('study'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('true khi cờ bật ở backend', async () => {
    mockedGet.mockResolvedValue(envelopeResponse(CAPABILITIES) as never);

    const { result } = await renderHook(() => useFeature('communication'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toBe(true));
  });

  /**
   * ⛔ `undefined` (chưa biết) phải TÁCH BIỆT với `false` (đã biết chắc là
   * tắt) — `useAccessibleModules()` dựa vào ranh giới này để không ẩn nhầm tab
   * trong lúc capabilities còn đang tải lần đầu.
   */
  it('undefined khi CHƯA có dữ liệu (đang tải)', async () => {
    mockedGet.mockReturnValue(new Promise(() => {}) as never); // không bao giờ resolve trong test này

    const { result } = await renderHook(() => useFeature('study'), { wrapper: createWrapper() });

    expect(result.current).toBeUndefined();
  });
});

describe('useCapabilities', () => {
  /**
   * ⛔ Gọi capabilities lúc CHƯA đăng nhập là một request 401 chắc chắn hỏng
   * — và nếu `EXPO_PUBLIC_ENABLE_REFRESH_TOKEN` đang bật thì đó còn là một
   * lượt refresh vô nghĩa ở MỖI lần mở app, trước cả khi người dùng kịp đăng
   * nhập lần đầu.
   */
  it('KHÔNG gọi API khi chưa đăng nhập', async () => {
    useAuthStore.getState().setStatus('anonymous');
    mockedGet.mockResolvedValue(envelopeResponse(CAPABILITIES) as never);

    await renderHook(() => useCapabilities(), { wrapper: createWrapper() });

    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('trả đủ hình dạng Capabilities (features/limits/upload)', async () => {
    mockedGet.mockResolvedValue(envelopeResponse(CAPABILITIES) as never);

    const { result } = await renderHook(() => useCapabilities(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toEqual(CAPABILITIES));
  });
});
