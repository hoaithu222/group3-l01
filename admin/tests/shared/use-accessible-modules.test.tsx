/**
 * `useAccessibleModules` — module có `featureFlag` PHẢI biến khỏi danh sách
 * khi BE báo cờ đó đang tắt (`capabilities.features[flag].enabled === false`).
 *
 * Mock `GET /api/v1/capabilities` bằng MSW (không mock hook) để đi đúng đường
 * thật: `useCapabilities()` → `useAccessibleModules()`.
 */
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAccessibleModules } from '@/app/router/permission/useAccessibleModules';
import { useAuthStore } from '@/app/store';

function capabilitiesBody(communicationEnabled: boolean) {
  return {
    success: true,
    data: {
      version: '1.0.0',
      features: {
        communication: { enabled: communicationEnabled, available: true },
        career: { enabled: true, available: true },
        o2o: { enabled: true, available: true },
        gamification: { enabled: true, available: true },
        integration: { enabled: true, available: true },
        ai: { enabled: false, available: true },
      },
      limits: {},
      upload: { maxFileBytes: 1, allowedMime: [], signedUrlTtlSeconds: 1 },
    },
  };
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useAccessibleModules — lọc theo featureFlag', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setAuth({
      user: { id: 'admin1', email: 'a@b.vn', name: 'Admin', roles: ['admin'], permissions: [] },
      token: 'test-token',
    });
  });

  it('cờ communication BẬT → thấy workspace/moderation', async () => {
    server.use(http.get('*/capabilities', () => HttpResponse.json(capabilitiesBody(true))));

    const { result } = renderHook(() => useAccessibleModules(), { wrapper });

    await waitFor(() => {
      const ids = result.current.map((m) => m.id);
      expect(ids).toContain('workspace');
      expect(ids).toContain('moderation');
    });
  });

  it('cờ communication TẮT → workspace/moderation biến khỏi danh sách', async () => {
    server.use(http.get('*/capabilities', () => HttpResponse.json(capabilitiesBody(false))));

    const { result } = renderHook(() => useAccessibleModules(), { wrapper });

    // Chờ capabilities tải xong RỒI mới khẳng định — trước khi tải xong,
    // registry vẫn tạm hiện module để tránh nhấp nháy (xem JSDoc hook).
    await waitFor(() => {
      const ids = result.current.map((m) => m.id);
      expect(ids).not.toContain('workspace');
      expect(ids).not.toContain('moderation');
    });

    // `user` (không có featureFlag) và `audit-log` không phụ thuộc cờ này.
    const ids = result.current.map((m) => m.id);
    expect(ids).toContain('user');
    expect(ids).toContain('audit-log');
  });
});
