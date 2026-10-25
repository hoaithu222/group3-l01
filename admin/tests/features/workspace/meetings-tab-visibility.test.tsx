/**
 * Tab "Cuộc họp" trong `WorkspaceDetailPage` (p2-04 admin.md §1, §4) — chỉ hiện khi cờ `meeting` bật VÀ có `workspace:view`; cờ tắt/thiếu quyền
 * thì ẩn hẳn và deep link `?tab=meetings` không gọi API cuộc họp. Mock ở tầng HTTP (MSW).
 *
 * Mở trang ở `?tab=reports` (chỉ hiện khung riêng của tab đó) để không kéo theo request tab Tổng quan — bài kiểm chỉ quan tâm danh sách tab.
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

import { FOUR_STATUSES, okBody, pageMeta } from './meetings-fixtures';

const MEETING_TAB = 'Cuộc họp';

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
let meetingCalls = 0;

const server = setupServer(
  http.get('*/capabilities', () => okBody({ features })),
  http.get('*/admin/workspaces/:id', () => okBody(DETAIL)),
  http.get('*/admin/workspaces/:id/meetings', () => {
    meetingCalls += 1;
    return okBody(FOUR_STATUSES, pageMeta(4));
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  features = {};
  meetingCalls = 0;
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

const flag = (name: string, enabled: boolean) => ({ [name]: { enabled, available: true } });

describe('WorkspaceDetailPage — tab "Cuộc họp"', () => {
  it('cờ meeting bật + có workspace:view ⇒ hiện tab, xếp sau các tab cơ bản và trước Tài liệu/Dự án/Ví; "Ghi hình"/"Cuộc gọi & họp" cần meeting:view nên KHÔNG hiện', async () => {
    features = { ...flag('meeting', true), ...flag('project', true), ...flag('wallet', true) };
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=reports');

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Tổng quan',
      'Thành viên',
      'Kênh',
      'Nhóm chat',
      'Báo cáo',
      MEETING_TAB,
      'Tài liệu',
      'Dự án',
      'Ví (thống kê)',
    ]);
  });

  it('cờ meeting tắt ⇒ ẩn tab', async () => {
    features = flag('meeting', false);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=reports');

    expect(screen.queryByRole('tab', { name: MEETING_TAB })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('BE không công bố cờ meeting ⇒ ẩn tab', async () => {
    features = {};
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=reports');

    expect(screen.queryByRole('tab', { name: MEETING_TAB })).not.toBeInTheDocument();
  });

  it('cờ bật nhưng thiếu workspace:view ⇒ ẩn tab', async () => {
    features = flag('meeting', true);
    signIn([]);
    await renderPage('/workspace/ws-1?tab=reports');

    expect(screen.queryByRole('tab', { name: MEETING_TAB })).not.toBeInTheDocument();
  });

  it('bấm tab ⇒ URL ?tab=meetings và hiện danh sách (đúng một lần gọi API)', async () => {
    features = flag('meeting', true);
    signIn(['workspace:view']);
    const { router } = await renderPage('/workspace/ws-1?tab=reports');
    expect(meetingCalls).toBe(0);

    await userEvent.setup().click(screen.getByRole('tab', { name: MEETING_TAB }));

    expect(await screen.findByText('Họp sắp tới')).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('tab')).toBe('meetings');
    expect(screen.getByRole('tab', { name: MEETING_TAB, selected: true })).toBeInTheDocument();
    expect(meetingCalls).toBe(1);
  });

  it('deep link ?tab=meetings khi cờ tắt ⇒ "không khả dụng", KHÔNG gọi API cuộc họp', async () => {
    features = flag('meeting', false);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=meetings');

    expect(await screen.findByText('Danh sách cuộc họp không khả dụng')).toBeInTheDocument();
    expect(screen.queryByText('Họp sắp tới')).not.toBeInTheDocument();
    expect(meetingCalls).toBe(0);
  });

  it('deep link ?tab=meetings khi thiếu workspace:view ⇒ "không khả dụng", KHÔNG gọi API', async () => {
    features = flag('meeting', true);
    signIn([]);
    await renderPage('/workspace/ws-1?tab=meetings');

    expect(await screen.findByText('Danh sách cuộc họp không khả dụng')).toBeInTheDocument();
    expect(meetingCalls).toBe(0);
  });
});
