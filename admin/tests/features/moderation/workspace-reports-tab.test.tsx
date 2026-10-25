/**
 * Tab `reports` của `WorkspaceDetailPage` (p1-08 admin.md §2, §4): danh sách báo cáo CỦA workspace
 * (`GET /admin/reports?workspaceId=`), bấm sang chi tiết và quay lại đúng tab; thiếu
 * `moderation:view` thì không gọi API. Mock ở tầng HTTP (MSW) + socket giả.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { useLocation } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetRoomSubscriptions } from '@/core/socket';
import WorkspaceDetailPage from '@/features/workspace/pages/WorkspaceDetailPage';

import { fakeSocket, joinPayloads } from './fake-socket';
import {
  errorJson,
  makeGroup,
  okJson,
  pageMeta,
  PERM_VIEW,
  renderRoutes,
  signIn,
  WORKSPACE_ID,
} from './moderation-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket: shared } = await import('./fake-socket');
  return { io: vi.fn(() => shared) };
});

const DETAIL = {
  workspace: {
    id: WORKSPACE_ID,
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

const requests: URLSearchParams[] = [];
const lastParams = () => requests[requests.length - 1];

const server = setupServer(
  http.get('*/capabilities', () => okJson({ features: {} })),
  http.get('*/admin/workspaces/:id', () => okJson(DETAIL)),
  http.get('*/admin/reports', ({ request }) => {
    requests.push(new URL(request.url).searchParams);
    return okJson([makeGroup({ reportId: 'r-ws' })], pageMeta(1));
  }),
);

beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
  server.close();
});
beforeEach(() => {
  requests.length = 0;
  fakeSocket.emit.mockClear();
  resetRoomSubscriptions();
  signIn([...PERM_VIEW, 'workspace:view']);
});

function ModerationDetailProbe() {
  const { pathname } = useLocation();
  return <output data-testid="probe">{pathname}</output>;
}

function renderTab(url = `/workspace/${WORKSPACE_ID}?tab=reports`) {
  return renderRoutes(
    [
      {
        path: '/workspace/:id',
        element: <WorkspaceDetailPage />,
        handle: { modulePath: '/workspace' },
      },
      { path: '/moderation/:id', element: <ModerationDetailProbe /> },
    ],
    [url],
  );
}

describe('tab "Báo cáo" của workspace', () => {
  it('gọi /admin/reports với workspaceId CỐ ĐỊNH của workspace, mặc định OPEN, và hiện dòng báo cáo', async () => {
    renderTab();

    expect(await screen.findByText('Báo cáo trong workspace')).toBeInTheDocument();
    expect(await screen.findByText('#general')).toBeInTheDocument();
    expect(lastParams().get('workspaceId')).toBe(WORKSPACE_ID);
    expect(lastParams().get('status')).toBe('OPEN');
    // Cột Workspace bị bỏ — mọi dòng cùng một workspace.
    expect(screen.queryByRole('columnheader', { name: 'Workspace' })).not.toBeInTheDocument();
    // Ô lọc workspace cũng không có (đã cố định).
    expect(screen.queryByText('Mọi workspace')).not.toBeInTheDocument();
    expect(joinPayloads()).toEqual([{ kind: 'admin', id: 'moderation' }]);
  });

  it('URL có ?workspaceId= khác cũng KHÔNG thắng workspace đang xem', async () => {
    renderTab(`/workspace/${WORKSPACE_ID}?tab=reports&workspaceId=665f1c2e8a1b2c3d4e5f6aaa`);
    await screen.findByText('#general');

    expect(lastParams().get('workspaceId')).toBe(WORKSPACE_ID);
  });

  it('bấm dòng → mở /moderation/:id (liên kết thật ở cột "Đích")', async () => {
    renderTab();
    const link = await screen.findByRole('link', { name: 'Tin nhắn' });
    expect(link).toHaveAttribute('href', '/moderation/r-ws');

    await userEvent.click(link);

    expect(await screen.findByTestId('probe')).toHaveTextContent('/moderation/r-ws');
  });

  it('lỗi tải: banner + "Thử lại" thay vì bảng "Không có báo cáo nào"; thử lại khi BE hồi phục hiện báo cáo', async () => {
    server.use(http.get('*/admin/reports', () => errorJson(500, 'SYS_500', 'Lỗi máy chủ')));
    renderTab();

    const title = await screen.findByText('Không tải được báo cáo của workspace');
    expect(screen.queryByText('#general')).not.toBeInTheDocument();

    server.use(
      http.get('*/admin/reports', () => okJson([makeGroup({ reportId: 'r-ws' })], pageMeta(1))),
    );
    await userEvent.click(
      within(title.closest('[role="alert"]') as HTMLElement).getByRole('button', {
        name: 'Thử lại',
      }),
    );

    expect(await screen.findByText('#general')).toBeInTheDocument();
  });

  it('lỗi 403 từ BE: nói rõ không có quyền, KHÔNG có nút "Thử lại"', async () => {
    server.use(http.get('*/admin/reports', () => errorJson(403, 'AUTH_005', 'Không có quyền')));
    renderTab();

    expect(await screen.findByText('Không tải được báo cáo của workspace')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản của bạn không có quyền xem mục này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('thiếu moderation:view → lời giải thích, KHÔNG gọi API, KHÔNG vào phòng realtime', async () => {
    signIn(['workspace:view']);
    renderTab();

    expect(await screen.findByText('Không có quyền xem báo cáo')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Báo cáo', selected: true })).toBeInTheDocument(),
    );
    expect(requests).toHaveLength(0);
    expect(joinPayloads()).toEqual([]);
  });
});
