/**
 * Tab `wallet` trong `WorkspaceDetailPage` (p6-04 admin.md §1, §4) — chỉ hiện khi
 * cờ `wallet` bật VÀ có `workspace:view`; cờ tắt/thiếu quyền thì ẩn hẳn và
 * deep link `?tab=wallet` không gọi API ví. Mock ở tầng HTTP (MSW).
 *
 * Mở trang ở `?tab=reports` (chỉ hiện khung "Sắp có") để không kéo theo request
 * của tab Tổng quan — bài kiểm chỉ quan tâm danh sách tab và tab ví.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CAPABILITIES_KEY } from '@/app/capabilities';
import { useAuthStore } from '@/app/store';
import WorkspaceDetailPage from '@/features/workspace/pages/WorkspaceDetailPage';

import { okBody, WALLET_STATS } from './wallet-tab-fixtures';

const WALLET_TAB = 'Ví (thống kê)';

const DETAIL = {
  workspace: {
    id: 'ws-1',
    name: 'Nhóm Alpha',
    avatarUrl: null,
    coverUrl: null,
    coverThumbUrl: null,
    coverPreset: null,
    owner: { id: 'o-1', name: 'Chủ nhóm' },
    memberCount: 3,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastActivityAt: '2026-09-01T00:00:00.000Z',
  },
  stats30d: { messages: 0, activeMembers: 0, files: 0 },
};

let features: Record<string, { enabled: boolean; available: boolean }> = {};
let walletCalls = 0;

const server = setupServer(
  http.get('*/capabilities', () => okBody({ features })),
  http.get('*/admin/workspaces/:id', () => okBody(DETAIL)),
  http.get('*/admin/workspaces/:id/wallet-stats', () => {
    walletCalls += 1;
    return okBody(WALLET_STATS);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  features = {};
  walletCalls = 0;
  useAuthStore.getState().clearAuth();
});

function signIn(permissions: string[]) {
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Quản lý', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

async function renderPage(url: string) {
  const router = createMemoryRouter(
    [{ path: '/workspace/:id', element: <WorkspaceDetailPage />, handle: { modulePath: '/workspace' } }],
    { initialEntries: [url] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole('tab', { name: 'Báo cáo' });
  // Chờ cờ tính năng đã về tới cache — thiếu bước này, "tab vắng mặt" có thể chỉ là chưa tải xong.
  await waitFor(() => expect(queryClient.getQueryData(CAPABILITIES_KEY)).toBeDefined());
  return { router };
}

const walletFlag = (enabled: boolean) => ({ wallet: { enabled, available: true } });

describe('WorkspaceDetailPage — tab "Ví (thống kê)"', () => {
  it('cờ wallet bật + có workspace:view ⇒ hiện tab, xếp sau các tab hiện có', async () => {
    features = walletFlag(true);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=reports');

    const names = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(names).toEqual(['Tổng quan', 'Thành viên', 'Kênh', 'Nhóm chat', 'Báo cáo', WALLET_TAB]);
  });

  it('cờ wallet tắt ⇒ ẩn tab', async () => {
    features = walletFlag(false);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=reports');

    expect(screen.queryByRole('tab', { name: WALLET_TAB })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('BE không công bố cờ wallet ⇒ ẩn tab', async () => {
    features = {};
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=reports');

    expect(screen.queryByRole('tab', { name: WALLET_TAB })).not.toBeInTheDocument();
  });

  it('cờ bật nhưng thiếu workspace:view ⇒ ẩn tab', async () => {
    features = walletFlag(true);
    signIn([]);
    await renderPage('/workspace/ws-1?tab=reports');

    expect(screen.queryByRole('tab', { name: WALLET_TAB })).not.toBeInTheDocument();
  });

  it('bấm tab ⇒ URL ?tab=wallet và hiện số liệu ví (đúng một lần gọi API)', async () => {
    features = walletFlag(true);
    signIn(['workspace:view']);
    const { router } = await renderPage('/workspace/ws-1?tab=reports');
    expect(walletCalls).toBe(0);

    await userEvent.setup().click(screen.getByRole('tab', { name: WALLET_TAB }));

    expect(await screen.findByText('Số liệu 30 ngày')).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('tab')).toBe('wallet');
    expect(screen.getByRole('tab', { name: WALLET_TAB, selected: true })).toBeInTheDocument();
    expect(walletCalls).toBe(1);
  });

  it('deep link ?tab=wallet khi cờ tắt ⇒ "không khả dụng", KHÔNG gọi API ví', async () => {
    features = walletFlag(false);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=wallet');

    expect(await screen.findByText('Thống kê ví không khả dụng')).toBeInTheDocument();
    expect(screen.queryByText('Số liệu 30 ngày')).not.toBeInTheDocument();
    expect(walletCalls).toBe(0);
  });

  it('deep link ?tab=wallet khi cờ bật ⇒ mở thẳng số liệu ví', async () => {
    features = walletFlag(true);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=wallet');

    expect(await screen.findByText('Số liệu 30 ngày')).toBeInTheDocument();
    expect(screen.queryByText('Thống kê ví không khả dụng')).not.toBeInTheDocument();
  });
});
