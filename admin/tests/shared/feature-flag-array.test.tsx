/**
 * `ModuleConfig.featureFlag` dạng MẢNG (p6-01 admin.md §1): phân hệ dùng chung cho hai tính năng độc lập (`integration` + `collab`) hiện và vào
 * được khi BẤT KỲ cờ nào bật; cả hai tắt → biến khỏi menu và route trả trang "Chưa bật". Mock `GET /capabilities` ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { integrationModule } from '@/app/router/modules/integration.routes';
import { FeatureGate } from '@/app/router/modules/FeatureGate';
import { isFeatureFlagEnabled } from '@/app/router/modules/feature-flag.utils';
import { useAccessibleModules } from '@/app/router/permission/useAccessibleModules';
import { useAuthStore } from '@/app/store';

type Features = Record<string, { enabled: boolean; available: boolean }>;
const flag = (enabled: boolean) => ({ enabled, available: true });

let features: Features = {};

const server = setupServer(
  http.get('*/capabilities', () =>
    HttpResponse.json({
      success: true,
      data: {
        version: '1.0.0',
        features,
        limits: {},
        upload: { maxFileBytes: 1, allowedMime: [], signedUrlTtlSeconds: 1 },
      },
    }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('isFeatureFlagEnabled', () => {
  it('chuỗi: bật khi cờ bật, tắt khi cờ tắt hoặc vắng', () => {
    expect(isFeatureFlagEnabled({ a: flag(true) }, 'a')).toBe(true);
    expect(isFeatureFlagEnabled({ a: flag(false) }, 'a')).toBe(false);
    expect(isFeatureFlagEnabled({}, 'a')).toBe(false);
  });

  it('mảng: bật khi BẤT KỲ cờ nào bật (OR)', () => {
    expect(isFeatureFlagEnabled({ a: flag(false), b: flag(true) }, ['a', 'b'])).toBe(true);
    expect(isFeatureFlagEnabled({ a: flag(true), b: flag(false) }, ['a', 'b'])).toBe(true);
    expect(isFeatureFlagEnabled({ a: flag(false), b: flag(false) }, ['a', 'b'])).toBe(false);
    expect(isFeatureFlagEnabled({ a: flag(false) }, ['a', 'b'])).toBe(false);
  });

  it('mảng rỗng: không có ràng buộc', () => {
    expect(isFeatureFlagEnabled({}, [])).toBe(true);
  });
});

describe('module integration — featureFlag mảng', () => {
  it('khai đúng ["integration","collab"] và có tab collab', () => {
    expect(integrationModule.featureFlag).toEqual(['integration', 'collab']);
    expect(integrationModule.tabTitles).toHaveProperty('collab');
  });
});

describe('useAccessibleModules — featureFlag mảng', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setAuth({
      user: { id: 'admin1', email: 'a@b.vn', name: 'Admin', roles: ['admin'], permissions: [] },
      token: 'test-token',
    });
  });

  const idsWhen = async (next: Features, assertion: (ids: string[]) => void) => {
    features = next;
    const { result } = renderHook(() => useAccessibleModules(), { wrapper });
    await waitFor(() => assertion(result.current.map((m) => m.id)));
  };

  it('chỉ collab bật (integration tắt) → VẪN thấy phân hệ integration', async () => {
    await idsWhen({ integration: flag(false), collab: flag(true) }, (ids) =>
      expect(ids).toContain('integration'),
    );
  });

  it('chỉ integration bật → thấy phân hệ (hành vi cũ không đổi)', async () => {
    await idsWhen({ integration: flag(true), collab: flag(false) }, (ids) =>
      expect(ids).toContain('integration'),
    );
  });

  it('cả hai tắt → phân hệ integration biến khỏi menu', async () => {
    await idsWhen(
      { integration: flag(false), collab: flag(false), gamification: flag(true) },
      (ids) => {
        expect(ids).not.toContain('integration');
        expect(ids).toContain('gamification');
      },
    );
  });
});

describe('FeatureGate — flag mảng', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setAuth({
      user: { id: 'admin1', email: 'a@b.vn', name: 'Admin', roles: ['admin'], permissions: [] },
      token: 'test-token',
    });
  });

  const renderGate = () =>
    render(
      <FeatureGate flag={['integration', 'collab']}>
        <p>Nội dung phân hệ</p>
      </FeatureGate>,
      { wrapper },
    );

  it('một trong hai cờ bật → hiện nội dung', async () => {
    features = { integration: flag(false), collab: flag(true) };
    renderGate();

    expect(await screen.findByText('Nội dung phân hệ')).toBeInTheDocument();
  });

  it('cả hai cờ tắt → trang "Chưa bật", KHÔNG mount nội dung', async () => {
    features = { integration: flag(false), collab: flag(false) };
    renderGate();

    await waitFor(() => expect(screen.queryByText('Nội dung phân hệ')).not.toBeInTheDocument());
    expect(await screen.findByText('Phân hệ chưa được bật trên hệ thống này')).toBeInTheDocument();
  });
});
