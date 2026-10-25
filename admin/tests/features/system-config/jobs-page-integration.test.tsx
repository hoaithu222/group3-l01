/**
 * Tab `jobs` đã ĐĂNG KÝ vào `tab-registry` và chạy được trong khung `SystemConfigPage`
 * thật (lazy-import + `?tab=` của trang cha sống chung với `?sub=` của tab):
 *  - nhãn `jobs` có trong `tabTitles` + có component trong registry ⇒ tab hiện, mở được
 *  - đổi sub-tab KHÔNG làm mất `?tab=jobs` của trang cha
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import SystemConfigPage from '@/features/system-config/pages/SystemConfigPage';
import { SYSTEM_CONFIG_TABS } from '@/features/system-config/tabs/tab-registry';

import { createJobsBackend, makeFailedJob, makeQueue, signInManager } from './jobs-test-utils';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signInManager();
});

function renderPage(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/system-config',
        element: <SystemConfigPage />,
        // Nhãn tab lấy đúng như `system-config.routes.tsx`.
        handle: {
          title: 'Cấu hình',
          modulePath: '/system-config',
          tabTitles: { jobs: 'Job nền' },
          defaultTab: 'jobs',
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
  return router;
}

describe('tab "Job nền" trong SystemConfigPage', () => {
  it('registry có khoá `jobs`', () => {
    expect(SYSTEM_CONFIG_TABS.jobs).toBeDefined();
  });

  it('?tab=jobs ⇒ tab cha được chọn và sub-tab "Hàng đợi" tải dữ liệu', async () => {
    const backend = createJobsBackend({ queues: [makeQueue('push', { failed: 2 })] });
    server.use(...backend.handlers);
    renderPage('/system-config?tab=jobs');

    expect(await screen.findByRole('tab', { name: 'Job nền', selected: true })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Hàng đợi push' })).toBeInTheDocument();
    expect(screen.getByText('Có lỗi')).toBeInTheDocument();
  });

  it('đổi sub-tab ghi ?sub= nhưng GIỮ ?tab=jobs; tab cha vẫn được chọn', async () => {
    const backend = createJobsBackend({
      queues: [makeQueue('push')],
      failed: [makeFailedJob()],
    });
    server.use(...backend.handlers);
    const user = userEvent.setup();
    const router = renderPage('/system-config?tab=jobs');
    await screen.findByRole('region', { name: 'Hàng đợi push' });

    await user.click(screen.getByRole('tab', { name: 'Job lỗi' }));

    expect(await screen.findByText('SMTP timeout khi gửi thư chào')).toBeInTheDocument();
    await waitFor(() => {
      const params = new URLSearchParams(router.state.location.search);
      expect(params.get('tab')).toBe('jobs');
      expect(params.get('sub')).toBe('failed');
    });
    expect(screen.getByRole('tab', { name: 'Job nền', selected: true })).toBeInTheDocument();
  });
});
