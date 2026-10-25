/**
 * Tab "Tích hợp" (`integrations`, p5-03 admin.md §2.4) và "Cố vấn" (`mentor`, p6-03 admin.md §1, §2.2) trong `WorkspaceDetailPage`:
 *  - "Tích hợp" chỉ hiện khi cờ `integration` bật VÀ có `integration:view` (BE chặn route bằng quyền này);
 *  - "Cố vấn" chỉ hiện khi cờ `mentor` bật VÀ có `workspace:view`;
 *  - cờ tắt / thiếu quyền ⇒ ẩn hẳn, deep link `?tab=` hiện khung "không khả dụng" và KHÔNG gọi API.
 * Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CAPABILITIES_KEY } from '@/app/capabilities';
import { workspaceModule } from '@/app/router/modules/workspace.routes';
import WorkspaceDetailPage from '@/features/workspace/pages/WorkspaceDetailPage';

import { CONNECTIONS, MENTOR_OVERVIEW } from './integrations-mentor-fixtures';
import { okBody, signIn } from './p3-fixtures';

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
let integrationCalls = 0;
let mentorCalls = 0;

const server = setupServer(
  http.get('*/capabilities', () => okBody({ features })),
  http.get('*/admin/workspaces/:id', () => okBody(DETAIL)),
  http.get('*/admin/workspaces/:id/integrations', () => {
    integrationCalls += 1;
    return okBody(CONNECTIONS);
  }),
  http.get('*/admin/workspaces/:id/mentor', () => {
    mentorCalls += 1;
    return okBody(MENTOR_OVERVIEW);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  features = {};
  integrationCalls = 0;
  mentorCalls = 0;
});

async function renderPage(url: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/workspace/:id',
        element: <WorkspaceDetailPage />,
        handle: { modulePath: '/workspace' },
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
  await screen.findByRole('tab', { name: 'Báo cáo' });
  // Chờ cờ tính năng đã về tới cache — thiếu bước này, "tab vắng mặt" có thể chỉ là chưa tải xong.
  await waitFor(() => expect(queryClient.getQueryData(CAPABILITIES_KEY)).toBeDefined());
  return { router };
}

const flag = (name: string, enabled: boolean) => ({ [name]: { enabled, available: true } });
const tabNames = () => screen.getAllByRole('tab').map((t) => t.textContent);

describe('registry workspace', () => {
  it('khai tiêu đề tab `integrations` và `mentor` cho tiêu đề tab trình duyệt', () => {
    expect(workspaceModule.tabTitles?.integrations).toBe('Tích hợp');
    expect(workspaceModule.tabTitles?.mentor).toBe('Cố vấn');
  });
});

describe('WorkspaceDetailPage — tab "Tích hợp"', () => {
  it('cờ integration bật + integration:view ⇒ hiện tab; ?tab=integrations mở danh sách kết nối', async () => {
    features = flag('integration', true);
    signIn(['integration:view']);
    await renderPage('/workspace/ws-1?tab=integrations');

    expect(tabNames()).toEqual([
      'Tổng quan',
      'Thành viên',
      'Kênh',
      'Nhóm chat',
      'Báo cáo',
      'Tích hợp',
    ]);
    expect(await screen.findByText('vci/app')).toBeInTheDocument();
    expect(integrationCalls).toBe(1);
  });

  it('quyền là integration:view, KHÔNG phải workspace:view ⇒ chỉ có workspace:view thì ẩn tab', async () => {
    features = flag('integration', true);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=reports');

    expect(screen.queryByRole('tab', { name: 'Tích hợp' })).not.toBeInTheDocument();
  });

  it('cờ integration tắt ⇒ ẩn tab', async () => {
    features = flag('integration', false);
    signIn(['integration:view']);
    await renderPage('/workspace/ws-1?tab=reports');
    expect(screen.queryByRole('tab', { name: 'Tích hợp' })).not.toBeInTheDocument();
  });

  it('BE không công bố cờ integration ⇒ ẩn tab', async () => {
    features = {};
    signIn(['integration:view']);
    await renderPage('/workspace/ws-1?tab=reports');
    expect(screen.queryByRole('tab', { name: 'Tích hợp' })).not.toBeInTheDocument();
  });

  it('deep link ?tab=integrations khi cờ tắt ⇒ khung "không khả dụng", KHÔNG gọi API tích hợp', async () => {
    features = flag('integration', false);
    signIn(['integration:view']);
    await renderPage('/workspace/ws-1?tab=integrations');

    expect(await screen.findByText('Danh sách tích hợp không khả dụng')).toBeInTheDocument();
    expect(integrationCalls).toBe(0);
  });

  it('deep link ?tab=integrations khi thiếu integration:view ⇒ KHÔNG gọi API tích hợp', async () => {
    features = flag('integration', true);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=integrations');

    expect(await screen.findByText('Danh sách tích hợp không khả dụng')).toBeInTheDocument();
    expect(integrationCalls).toBe(0);
  });
});

describe('WorkspaceDetailPage — tab "Cố vấn"', () => {
  it('cờ mentor bật + workspace:view ⇒ hiện tab; bấm tab mở dữ liệu cố vấn', async () => {
    features = flag('mentor', true);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=reports');

    expect(tabNames()).toEqual([
      'Tổng quan',
      'Thành viên',
      'Kênh',
      'Nhóm chat',
      'Báo cáo',
      'Cố vấn',
    ]);
    expect(mentorCalls).toBe(0);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Cố vấn' }));
    expect(await screen.findByText('Trần Cố Vấn')).toBeInTheDocument();
    expect(mentorCalls).toBe(1);
  });

  it('cờ mentor tắt ⇒ ẩn tab', async () => {
    features = flag('mentor', false);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=reports');
    expect(screen.queryByRole('tab', { name: 'Cố vấn' })).not.toBeInTheDocument();
  });

  it('BE không công bố cờ mentor ⇒ ẩn tab', async () => {
    features = {};
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=reports');
    expect(screen.queryByRole('tab', { name: 'Cố vấn' })).not.toBeInTheDocument();
  });

  it('cờ bật nhưng thiếu workspace:view ⇒ ẩn tab', async () => {
    features = flag('mentor', true);
    signIn([]);
    await renderPage('/workspace/ws-1?tab=reports');
    expect(screen.queryByRole('tab', { name: 'Cố vấn' })).not.toBeInTheDocument();
  });

  it('deep link ?tab=mentor khi cờ tắt ⇒ khung "không khả dụng", KHÔNG gọi API cố vấn', async () => {
    features = flag('mentor', false);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=mentor');

    expect(await screen.findByText('Dữ liệu cố vấn không khả dụng')).toBeInTheDocument();
    expect(mentorCalls).toBe(0);
  });
});

describe('WorkspaceDetailPage — thứ tự tab', () => {
  it('Tích hợp, Cố vấn đứng sau Dự án và trước tab ví', async () => {
    features = {
      ...flag('project', true),
      ...flag('integration', true),
      ...flag('mentor', true),
      ...flag('wallet', true),
    };
    signIn(['workspace:view', 'integration:view']);
    await renderPage('/workspace/ws-1?tab=reports');

    expect(tabNames().slice(-5)).toEqual([
      'Tài liệu',
      'Dự án',
      'Tích hợp',
      'Cố vấn',
      'Ví (thống kê)',
    ]);
  });
});
