/**
 * Tab "Tài liệu" (`resources`) và "Dự án" (`projects`) trong `WorkspaceDetailPage` (p3-01 admin.md §1,
 * p3-02 admin.md §1, §4) — chỉ hiện khi cờ `project` bật VÀ có `workspace:view`; cờ tắt/thiếu quyền thì
 * ẩn hẳn và deep link không gọi API số liệu. Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CAPABILITIES_KEY } from '@/app/capabilities';
import WorkspaceDetailPage from '@/features/workspace/pages/WorkspaceDetailPage';

import { REVIEW_STATS } from '../peer-review/review-fixtures';
import { CONTRIBUTION_STATS, okBody, PROJECT_STATS, RESOURCE_STATS, signIn } from './p3-fixtures';

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
let resourceCalls = 0;
let projectCalls = 0;
let contributionCalls = 0;
let reviewCalls = 0;

const server = setupServer(
  http.get('*/capabilities', () => okBody({ features })),
  http.get('*/admin/workspaces/:id', () => okBody(DETAIL)),
  http.get('*/admin/workspaces/:id/resource-stats', () => {
    resourceCalls += 1;
    return okBody(RESOURCE_STATS);
  }),
  http.get('*/admin/workspaces/:id/project-stats', () => {
    projectCalls += 1;
    return okBody(PROJECT_STATS);
  }),
  http.get('*/admin/workspaces/:id/contribution-stats', () => {
    contributionCalls += 1;
    return okBody(CONTRIBUTION_STATS);
  }),
  http.get('*/admin/workspaces/:id/review-stats', () => {
    reviewCalls += 1;
    return okBody(REVIEW_STATS);
  }),
  http.get('*/admin/workspaces/:id/wallet-stats', () => okBody({})),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  features = {};
  resourceCalls = 0;
  projectCalls = 0;
  contributionCalls = 0;
  reviewCalls = 0;
});

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

const flag = (name: string, enabled: boolean) => ({ [name]: { enabled, available: true } });

describe('WorkspaceDetailPage — tab "Tài liệu" và "Dự án"', () => {
  it('cờ project bật + có workspace:view ⇒ hiện hai tab, xếp sau các tab hiện có', async () => {
    features = flag('project', true);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=resources');

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Tổng quan',
      'Thành viên',
      'Kênh',
      'Nhóm chat',
      'Báo cáo',
      'Tài liệu',
      'Dự án',
    ]);
  });

  it('cờ project và wallet cùng bật ⇒ Tài liệu, Dự án đứng trước tab ví', async () => {
    features = { ...flag('project', true), ...flag('wallet', true) };
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=resources');

    const names = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(names.slice(-3)).toEqual(['Tài liệu', 'Dự án', 'Ví (thống kê)']);
  });

  it('cờ project tắt ⇒ ẩn cả hai tab', async () => {
    features = flag('project', false);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=reports');

    expect(screen.queryByRole('tab', { name: 'Tài liệu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Dự án' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('BE không công bố cờ project ⇒ ẩn cả hai tab', async () => {
    features = {};
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=reports');

    expect(screen.queryByRole('tab', { name: 'Tài liệu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Dự án' })).not.toBeInTheDocument();
  });

  it('cờ bật nhưng thiếu workspace:view ⇒ ẩn cả hai tab', async () => {
    features = flag('project', true);
    signIn([]);
    await renderPage('/workspace/ws-1?tab=reports');

    expect(screen.queryByRole('tab', { name: 'Tài liệu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Dự án' })).not.toBeInTheDocument();
  });

  it('deep link ?tab=resources khi cờ tắt ⇒ khung "không khả dụng", KHÔNG gọi API kho tài liệu', async () => {
    features = flag('project', false);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=resources');

    expect(await screen.findByText('Số liệu dự án và tài liệu không khả dụng')).toBeInTheDocument();
    expect(resourceCalls).toBe(0);
    expect(projectCalls).toBe(0);
    expect(contributionCalls).toBe(0);
    expect(reviewCalls).toBe(0);
  });

  it('cờ bật: ?tab=resources hiện số liệu tài liệu; bấm tab "Dự án" chuyển sang số liệu dự án', async () => {
    features = flag('project', true);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=resources');

    expect(await screen.findByText('Dung lượng kho tài liệu')).toBeInTheDocument();
    expect(resourceCalls).toBe(1);
    expect(projectCalls).toBe(0);

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Dự án' }));
    expect(await screen.findByText('Tổng quan dự án')).toBeInTheDocument();
    // Tên bảng hiện ở bảng dự án và (khi khối Chấm chéo tải xong) cả ở bảng chấm chéo — không cố định 1 lần.
    expect(screen.getAllByText('Đồ án cuối kỳ').length).toBeGreaterThan(0);
    expect(projectCalls).toBe(1);
    // Khối "Báo cáo đóng góp" (p4-06) nằm trong tab Dự án và chỉ gọi API số đếm khi tab này mở.
    expect(await screen.findByText('Báo cáo đóng góp')).toBeInTheDocument();
    expect(contributionCalls).toBe(1);
    // Khối "Chấm chéo" (p4-05) cũng chỉ gọi số đếm khi tab Dự án mở.
    expect(await screen.findByText('Chấm chéo')).toBeInTheDocument();
    expect(reviewCalls).toBe(1);
  });
});
