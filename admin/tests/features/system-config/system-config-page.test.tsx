/**
 * Khung `SystemConfigPage` (p0-07 admin.md §2.1, §4) — tab URL-synced, tab có
 * nhãn mà CHƯA có component trong `tab-registry` bị ẩn (không hiện tab rỗng).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import SystemConfigPage from '@/features/system-config/pages/SystemConfigPage';

const server = setupServer(
  http.get('*/admin/system-config', () => HttpResponse.json({ success: true, data: [] })),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features: {} } })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const TAB_TITLES = {
  limits: 'Giới hạn',
  features: 'Tính năng',
  // Có nhãn nhưng chưa có component trong tab-registry ⇒ phải bị ẩn.
  ghost: 'Tab chưa đăng ký',
};

function renderPage(url: string) {
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Admin', roles: ['admin'], permissions: [] },
    token: 'test-token',
  });
  const router = createMemoryRouter(
    [
      {
        path: '/system-config',
        element: <SystemConfigPage />,
        handle: {
          title: 'Cấu hình',
          modulePath: '/system-config',
          tabTitles: TAB_TITLES,
          defaultTab: 'limits',
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

describe('SystemConfigPage', () => {
  it('chỉ hiện tab đã đăng ký component; tab thiếu component bị ẩn', async () => {
    renderPage('/system-config');

    expect(await screen.findByRole('tab', { name: 'Giới hạn' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tính năng' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Tab chưa đăng ký' })).not.toBeInTheDocument();
  });

  it('URL không có ?tab= → mở tab mặc định (limits)', async () => {
    renderPage('/system-config');

    expect(
      await screen.findByRole('tab', { name: 'Giới hạn', selected: true }),
    ).toBeInTheDocument();
  });

  it('?tab=features → mở đúng tab', async () => {
    renderPage('/system-config?tab=features');

    expect(
      await screen.findByRole('tab', { name: 'Tính năng', selected: true }),
    ).toBeInTheDocument();
  });

  it('?tab= trỏ tab không tồn tại/chưa đăng ký → rơi về tab đầu tiên', async () => {
    renderPage('/system-config?tab=ghost');

    expect(
      await screen.findByRole('tab', { name: 'Giới hạn', selected: true }),
    ).toBeInTheDocument();
  });
});
