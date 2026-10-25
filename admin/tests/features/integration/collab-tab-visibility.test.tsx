/**
 * `IntegrationPage` sau p6-01: phân hệ dùng chung hai cờ độc lập (`integration`, `collab`) nên MỖI TAB tự ẩn khi cờ riêng của nó tắt; tab
 * `collab` chỉ hiện khi cờ `collab` bật. Nội dung các tab được thay bằng khung giả — bài kiểm chỉ quan tâm dải tab + tab nào được mount.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CAPABILITIES_KEY } from '@/app/capabilities';
import { integrationModule } from '@/app/router/modules/integration.routes';
import { useAuthStore } from '@/app/store';
import IntegrationPage from '@/features/integration/pages/IntegrationPage';
import { HeaderSlotsHarness } from '@tests/shared/header-slots-harness';

vi.mock('@/features/integration/components/WebhookEventsTab', () => ({
  default: () => <p>khung-su-kien-webhook</p>,
}));
vi.mock('@/features/integration/components/ProvidersTab', () => ({
  default: () => <p>khung-nha-cung-cap</p>,
}));
vi.mock('@/features/integration/components/ErrorConnectionsTab', () => ({
  default: () => <p>khung-ket-noi-loi</p>,
}));
vi.mock('@/features/collab-ops/components/CollabOpsTab', () => ({
  default: () => <p>khung-soan-thao-cong-tac</p>,
}));

const COLLAB_TAB = 'Soạn thảo cộng tác';
const flag = (enabled: boolean) => ({ enabled, available: true });

let features: Record<string, { enabled: boolean; available: boolean }> = {};

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
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: {
      id: 'ops1',
      email: 'ops@congty.vn',
      name: 'Vận hành',
      roles: ['manager'],
      permissions: ['integration:view'],
    },
    token: 'test-token',
  });
});

async function renderPage(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/integration',
        // Dải tab nằm trên THANH HEADER (portal) — harness dựng đích portal cho page render riêng lẻ.
        element: (
          <HeaderSlotsHarness>
            <IntegrationPage />
          </HeaderSlotsHarness>
        ),
        // Đúng `handle` mà `build-routes` dựng từ registry.
        handle: {
          title: integrationModule.title,
          modulePath: integrationModule.path,
          tabTitles: integrationModule.tabTitles,
          defaultTab: integrationModule.defaultTab,
        },
      },
    ],
    { initialEntries: [url] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  // Chờ cờ về cache — thiếu bước này, "tab vắng mặt" có thể chỉ là chưa tải xong.
  await waitFor(() => expect(queryClient.getQueryData(CAPABILITIES_KEY)).toBeDefined());
  return { router };
}

/** Chip tab trên thanh header (link) — harness chỉ có ba slot rỗng nên mọi link trong `banner` đều là chip tab. */
const headerTabs = () => within(screen.getByRole('banner'));

/**
 * Tên các chip tab, đúng thứ tự hiển thị. Đọc `aria-label` trước: chip có nhãn rút gọn (`SHORT_LABELS` của trang) giữ
 * CẢ HAI nhãn trong DOM nên `textContent` dính "Sự kiện webhookWebhook"; `aria-label` là nhãn đầy đủ.
 */
const tabNames = () =>
  headerTabs()
    .getAllByRole('link')
    .map((t) => t.getAttribute('aria-label') ?? t.textContent);

describe('IntegrationPage — tab theo cờ', () => {
  it('cả hai cờ bật → đủ 4 tab, tab collab đứng cuối', async () => {
    features = { integration: flag(true), collab: flag(true) };
    await renderPage('/integration');

    await waitFor(() =>
      expect(tabNames()).toEqual(['Sự kiện webhook', 'Nhà cung cấp', 'Kết nối lỗi', COLLAB_TAB]),
    );
    expect(screen.getByText('khung-su-kien-webhook')).toBeInTheDocument();
  });

  it('cờ collab TẮT → ẩn tab collab, ba tab cũ giữ nguyên', async () => {
    features = { integration: flag(true), collab: flag(false) };
    await renderPage('/integration');

    await waitFor(() =>
      expect(tabNames()).toEqual(['Sự kiện webhook', 'Nhà cung cấp', 'Kết nối lỗi']),
    );
    expect(screen.queryByRole('link', { name: COLLAB_TAB })).not.toBeInTheDocument();
  });

  it('deep link ?tab=collab khi cờ collab tắt → rơi về tab đầu, KHÔNG mount tab collab', async () => {
    features = { integration: flag(true), collab: flag(false) };
    await renderPage('/integration?tab=collab');

    expect(await screen.findByText('khung-su-kien-webhook')).toBeInTheDocument();
    expect(screen.queryByText('khung-soan-thao-cong-tac')).not.toBeInTheDocument();
  });

  it('cờ integration TẮT nhưng collab BẬT → chỉ còn tab collab (không mount tab webhook dù deep link)', async () => {
    features = { integration: flag(false), collab: flag(true) };
    await renderPage('/integration?tab=events');

    expect(await screen.findByText('khung-soan-thao-cong-tac')).toBeInTheDocument();
    expect(tabNames()).toEqual([COLLAB_TAB]);
    expect(screen.queryByText('khung-su-kien-webhook')).not.toBeInTheDocument();
  });

  it('bấm tab collab → URL ?tab=collab và mount nội dung', async () => {
    features = { integration: flag(true), collab: flag(true) };
    const { router } = await renderPage('/integration');
    await headerTabs().findByRole('link', { name: COLLAB_TAB });

    await userEvent.setup().click(headerTabs().getByRole('link', { name: COLLAB_TAB }));

    expect(await screen.findByText('khung-soan-thao-cong-tac')).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('tab')).toBe('collab');
  });
});
