/**
 * `HomePage` (tổng quan) — tải số liệu lỗi phải báo lỗi + "Thử lại", KHÔNG hiện thành "0 người dùng
 * mới / 0 báo cáo chờ xử lý". Mock ở tầng HTTP (MSW): interceptor → React Query → trang.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import HomePage from '@/app/pages/HomePage';
import { useAuthStore } from '@/app/store';

const OVERVIEW = {
  newUsers7d: 12,
  activeWorkspaces: 3,
  openReports: 5,
  failedAiJobs24h: 0,
  realtime: { socketConnections: 42, onlineUsers: 7 },
  activeUsersSeries: [],
};

const server = setupServer(
  http.get('*/capabilities', () =>
    HttpResponse.json({
      success: true,
      data: {
        version: 't',
        features: { communication: { enabled: true, available: true } },
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
    user: { id: 'me', email: 'a@x.vn', name: 'Admin', roles: ['admin'], permissions: [] },
    token: 'test-token',
  });
});

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HomePage — số liệu tổng quan', () => {
  it('tải lỗi: báo lỗi + "Thử lại", KPI hiện "—" (không phải 0); thử lại thành công thì hiện số thật', async () => {
    server.use(
      http.get('*/admin/overview', () =>
        HttpResponse.json(
          { success: false, error: { code: 'SYS_500', message: 'Lỗi máy chủ' } },
          { status: 500 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderHome();

    expect(await screen.findByText('Không tải được số liệu tổng quan')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText('0')).not.toBeInTheDocument();

    server.use(http.get('*/admin/overview', () => HttpResponse.json({ success: true, data: OVERVIEW })));
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect((await screen.findAllByText('12')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Không tải được số liệu tổng quan')).not.toBeInTheDocument();
  });
});
