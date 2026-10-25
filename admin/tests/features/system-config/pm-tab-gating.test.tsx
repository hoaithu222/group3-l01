/**
 * Tab `pm` trong khung `SystemConfigPage` (p3-02 admin.md §2.2, README p3 §5): đăng ký ở `tab-registry` với
 * cờ `project` — cờ tắt ⇒ khung "phân hệ chưa được bật"; cờ bật ⇒ mở giới hạn bảng/thẻ + mẫu cột mặc định.
 * Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import SystemConfigPage from '@/features/system-config/pages/SystemConfigPage';
import { SYSTEM_CONFIG_TABS } from '@/features/system-config/tabs/tab-registry';

import { BOARD_LIMITS, PM_ITEM, signIn, TASK_LIMITS } from './p3-config-fixtures';

let features: Record<string, { enabled: boolean; available: boolean }> = {};

const server = setupServer(
  http.get('*/admin/system-config', () =>
    HttpResponse.json({ success: true, data: [BOARD_LIMITS, TASK_LIMITS, PM_ITEM] }),
  ),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features } })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  features = {};
  signIn(['system-config:view', 'system-config:update']);
});

function renderPage(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/system-config',
        element: <SystemConfigPage />,
        handle: {
          title: 'Cấu hình',
          modulePath: '/system-config',
          tabTitles: { limits: 'Giới hạn', pm: 'Dự án' },
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
}

describe('tab pm — đăng ký và cờ project', () => {
  it('tab-registry có pm, gắn cờ `project`', () => {
    expect(SYSTEM_CONFIG_TABS.pm).toBeDefined();
    expect(SYSTEM_CONFIG_TABS.pm.featureFlag).toBe('project');
  });

  it('hiện tab "Dự án" trong khung; ?tab=pm + cờ project bật ⇒ mở giới hạn và mẫu cột mặc định', async () => {
    features = { project: { enabled: true, available: true } };
    renderPage('/system-config?tab=pm');

    expect(await screen.findByRole('tab', { name: 'Dự án', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('Cột mặc định khi tạo bảng')).toBeInTheDocument();
    expect(screen.getByText('Bảng công việc')).toBeInTheDocument();
    expect(screen.getByText('Thẻ công việc')).toBeInTheDocument();
  });

  it('?tab=pm + cờ project tắt ⇒ "Phân hệ chưa được bật", KHÔNG lộ trình sửa', async () => {
    features = { project: { enabled: false, available: true } };
    renderPage('/system-config?tab=pm');

    expect(await screen.findByText('Phân hệ chưa được bật trên hệ thống này')).toBeInTheDocument();
    expect(screen.queryByText('Cột mặc định khi tạo bảng')).not.toBeInTheDocument();
    expect(screen.queryByText('Bảng công việc')).not.toBeInTheDocument();
  });
});
