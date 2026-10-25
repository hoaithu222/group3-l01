/**
 * Tab "Ghi hình" trong `WorkspaceDetailPage` (p2-06 admin.md §1): chỉ hiện khi cờ `meeting` bật VÀ có `meeting:view` (BE chặn `/admin/recordings*` bằng quyền
 * này — KHÁC tab "Cuộc họp" cần `workspace:view`), đứng ngay sau tab Cuộc họp khi cả hai cùng hiện; cờ tắt/thiếu quyền thì ẩn hẳn và deep link
 * `?tab=recordings` không gọi API ghi hình.
 * Mock ở tầng HTTP (MSW). Mở trang ở `?tab=reports` để không kéo theo request tab Tổng quan.
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

import { okBody, pageMeta, RECORDING_ROWS, signIn, SUMMARY } from './recordings-fixtures';

const RECORDING_TAB = 'Ghi hình';

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
let listCalls: URLSearchParams[] = [];
let summaryCalls = 0;

const server = setupServer(
  http.get('*/capabilities', () => okBody({ features })),
  http.get('*/admin/workspaces/:id', () => okBody(DETAIL)),
  http.get('*/admin/recordings/summary', () => {
    summaryCalls += 1;
    return okBody(SUMMARY);
  }),
  http.get('*/admin/recordings', ({ request }) => {
    listCalls.push(new URL(request.url).searchParams);
    return okBody(RECORDING_ROWS, pageMeta(RECORDING_ROWS.length));
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  features = {};
  listCalls = [];
  summaryCalls = 0;
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

describe('WorkspaceDetailPage — tab "Ghi hình"', () => {
  it('cờ meeting bật + có meeting:view (và workspace:view) ⇒ hiện tab ngay sau "Cuộc họp"', async () => {
    features = flag('meeting', true);
    signIn(['workspace:view', 'meeting:view']);
    await renderPage('/workspace/ws-1?tab=reports');

    const names = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(names.indexOf(RECORDING_TAB)).toBe(names.indexOf('Cuộc họp') + 1);
  });

  it('cờ meeting tắt ⇒ ẩn tab', async () => {
    features = flag('meeting', false);
    signIn(['workspace:view', 'meeting:view']);
    await renderPage('/workspace/ws-1?tab=reports');
    expect(screen.queryByRole('tab', { name: RECORDING_TAB })).not.toBeInTheDocument();
  });

  it('BE không công bố cờ meeting ⇒ ẩn tab', async () => {
    features = {};
    signIn(['workspace:view', 'meeting:view']);
    await renderPage('/workspace/ws-1?tab=reports');
    expect(screen.queryByRole('tab', { name: RECORDING_TAB })).not.toBeInTheDocument();
  });

  it('cờ bật nhưng thiếu meeting:view ⇒ ẩn tab (workspace:view không đủ: BE trả 403 cho /admin/recordings)', async () => {
    features = flag('meeting', true);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=reports');
    expect(screen.queryByRole('tab', { name: RECORDING_TAB })).not.toBeInTheDocument();
    // Tab Cuộc họp (`workspace:view`) vẫn hiện — hai tab có gate khác nhau.
    expect(screen.getByRole('tab', { name: 'Cuộc họp' })).toBeInTheDocument();
  });

  it('chỉ có meeting:view (không workspace:view) ⇒ hiện "Ghi hình" nhưng ẩn "Cuộc họp"', async () => {
    features = flag('meeting', true);
    signIn(['meeting:view']);
    await renderPage('/workspace/ws-1?tab=reports');
    expect(screen.getByRole('tab', { name: RECORDING_TAB })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Cuộc họp' })).not.toBeInTheDocument();
  });

  it('bấm tab ⇒ URL ?tab=recordings, hiện danh sách của ĐÚNG workspace (một lần gọi danh sách + một lần tóm tắt); chưa bấm thì không gọi API', async () => {
    features = flag('meeting', true);
    signIn(['workspace:view', 'meeting:view']);
    const { router } = await renderPage('/workspace/ws-1?tab=reports');
    expect(listCalls).toHaveLength(0);

    await userEvent.setup().click(screen.getByRole('tab', { name: RECORDING_TAB }));

    expect(await screen.findByText('Họp tuần sản phẩm')).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('tab')).toBe('recordings');
    expect(screen.getByRole('tab', { name: RECORDING_TAB, selected: true })).toBeInTheDocument();
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0]!.get('workspaceId')).toBe('ws-1');
    await waitFor(() => expect(summaryCalls).toBe(1));
  });

  it('deep link ?tab=recordings khi cờ tắt ⇒ "không khả dụng", KHÔNG gọi API ghi hình', async () => {
    features = flag('meeting', false);
    signIn(['workspace:view', 'meeting:view']);
    await renderPage('/workspace/ws-1?tab=recordings');
    expect(await screen.findByText('Danh sách ghi hình không khả dụng')).toBeInTheDocument();
    expect(listCalls).toHaveLength(0);
    expect(summaryCalls).toBe(0);
  });

  it('deep link ?tab=recordings khi thiếu meeting:view ⇒ "không khả dụng", KHÔNG gọi API ghi hình (tránh 403)', async () => {
    features = flag('meeting', true);
    signIn(['workspace:view']);
    await renderPage('/workspace/ws-1?tab=recordings');
    expect(await screen.findByText('Danh sách ghi hình không khả dụng')).toBeInTheDocument();
    expect(listCalls).toHaveLength(0);
    expect(summaryCalls).toBe(0);
  });
});
