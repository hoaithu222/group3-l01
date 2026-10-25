/**
 * `useCapabilities` / `useFeature` — đọc cờ tính năng từ `GET /api/v1/capabilities`
 * qua MSW (mock ở tầng HTTP, không mock service) để bài kiểm đi đúng đường thật
 * (axios interceptor, unwrap `ApiResponse`).
 */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useCapabilities, useFeature } from '@/app/capabilities';
import { useAuthStore } from '@/app/store';

const CAPABILITIES_BODY = {
  success: true,
  data: {
    version: '1.0.0',
    features: {
      communication: { enabled: true, available: true },
      o2o: { enabled: false, available: true },
    },
    limits: {},
    upload: { maxFileBytes: 10_000_000, allowedMime: ['image/png'], signedUrlTtlSeconds: 300 },
  },
};

const server = setupServer(http.get('*/capabilities', () => HttpResponse.json(CAPABILITIES_BODY)));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useCapabilities / useFeature', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setAuth({
      user: { id: 'u1', email: 'a@b.vn', name: 'A', roles: ['user'], permissions: [] },
      token: 'test-token',
    });
  });

  it('tải cờ tính năng từ BE và trả đúng dữ liệu', async () => {
    const { result } = renderHook(() => useCapabilities(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.version).toBe('1.0.0');
    expect(result.current.data?.features.communication.enabled).toBe(true);
    expect(result.current.data?.features.o2o.enabled).toBe(false);
  });

  it('useFeature trả true cho cờ đang bật', async () => {
    const { result } = renderHook(() => useFeature('communication'), { wrapper });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('useFeature trả false cho cờ đang tắt', async () => {
    const { result } = renderHook(() => useFeature('o2o'), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('useFeature trả false cho cờ chưa khai — KHÔNG mặc định true', async () => {
    const { result } = renderHook(() => useFeature('khong-ton-tai'), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
  });
});
