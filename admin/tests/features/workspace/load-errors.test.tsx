/**
 * Phân hệ `workspace` — trạng thái LỖI TẢI của trang danh sách, trang chi tiết và các tab.
 *
 * Trước đây các trang này chỉ có `data ?? []` / `?? 0`: BE lỗi thì bảng hiện "Chưa có thành viên", thẻ số hiện `0`,
 * biểu đồ hiện "Chưa có dữ liệu" — như thể nhóm thật sự trống. Nay:
 *  - lỗi TẠM THỜI (5xx, mất mạng) ⇒ banner lỗi + "Thử lại" (bấm khi BE hồi phục thì hiện dữ liệu thật);
 *  - 403 / 404 ⇒ `EmptyState` nói rõ lý do và KHÔNG có nút — thử lại vẫn 403/404;
 *  - con số chưa có ⇒ "—", không bao giờ `0`.
 *
 * Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import WorkspaceOverviewTab from '@/features/workspace/components/WorkspaceOverviewTab';
import WorkspaceChannelsTab from '@/features/workspace/components/tabs/WorkspaceChannelsTab';
import WorkspaceConversationsTab from '@/features/workspace/components/tabs/WorkspaceConversationsTab';
import WorkspaceMembersTab from '@/features/workspace/components/tabs/WorkspaceMembersTab';
import WorkspaceDetailPage from '@/features/workspace/pages/WorkspaceDetailPage';
import WorkspaceListPage from '@/features/workspace/pages/WorkspaceListPage';
import type {
  AdminWorkspaceDetail,
  AdminWorkspaceRow,
} from '@/features/workspace/types/workspace.types';
import { HeaderSlotsHarness } from '@tests/shared/header-slots-harness';

import { ACCESS_SUMMARY, errorBody, okBody, renderWithRouter, signIn } from './p3-fixtures';

const META = { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false };

const WORKSPACE: AdminWorkspaceRow = {
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
};
const DETAIL: AdminWorkspaceDetail = {
  workspace: WORKSPACE,
  stats30d: { messages: 12345, activeMembers: 2, files: 7 },
};

const MEMBER = {
  user: { id: 'u-1', name: 'Trưởng nhóm Nam' },
  role: 'OWNER',
  status: 'ACTIVE',
  joinedAt: '2026-01-01T00:00:00.000Z',
  invitedBy: null,
  expiresAt: null,
  banReason: null,
};

const CHANNELS = {
  public: [
    {
      id: 'c-1',
      name: 'chung',
      type: 'TEXT',
      postingPolicy: 'MEMBERS',
      status: 'ACTIVE',
      isDefault: true,
      archiveReason: null,
      memberCount: 8,
      messages7d: 4,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  privateCount: 6,
  privateArchivedCount: 0,
  meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
};

const CONVERSATIONS = {
  data: [
    {
      id: '64a1b2c3d4e5f60718293a4b5c',
      kind: 'GROUP',
      memberCount: 1234,
      ownerName: 'An Nguyễn',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastActivityAt: '2026-09-01T00:00:00.000Z',
      isMeetingGroup: false,
    },
  ],
  meta: META,
  stats: { groups: 2, activeGroups7d: 1, dmPairs: 3, messages7d: 12 },
};

const STATS_DAYS = [{ date: '2026-09-01', messages: 5, activeMembers: 2 }];

const fail = () => errorBody(500, 'SYS_500', 'Lỗi máy chủ');
const forbidden = () => errorBody(403, 'AUTH_005', 'Không có quyền');
const notFound = () => errorBody(404, 'RES_001', 'Không tìm thấy');

const server = setupServer(
  // Phần "khách / lời mời / yêu cầu" của tab Thành viên và khối "Truy cập nhóm" của tab Tổng quan — luôn tải được.
  http.get('*/admin/workspaces/:id/access-summary', () => okBody(ACCESS_SUMMARY)),
  http.get('*/admin/workspaces/:id/invitations', () => okBody([], { ...META, total: 0 })),
  http.get('*/capabilities', () => okBody({ features: {} })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => signIn(['workspace:view']));

const retryIn = (el: HTMLElement) => within(el).getByRole('button', { name: 'Thử lại' });
/** Banner `role=alert` mang tiêu đề `title` (tránh nhầm với banner lỗi khác cùng trang). */
const alertTitled = (title: string) => {
  const el = screen.getByText(title).closest('[role="alert"]');
  if (!el) throw new Error(`"${title}" không nằm trong banner lỗi`);
  return el as HTMLElement;
};
const counts = (label: string) => screen.getByText(label).parentElement as HTMLElement;

describe('WorkspaceListPage', () => {
  it('lỗi 500: banner + "Thử lại" (không vẽ bảng "Chưa có workspace nào"); thử lại khi BE hồi phục hiện dữ liệu', async () => {
    server.use(http.get('*/admin/workspaces', fail));
    const user = userEvent.setup();
    renderWithRouter(<WorkspaceListPage />, '/workspace');

    const banner = await waitFor(() => alertTitled('Không tải được danh bạ workspace'));
    expect(screen.queryByText('Chưa có workspace nào')).not.toBeInTheDocument();

    server.use(http.get('*/admin/workspaces', () => okBody([WORKSPACE], META)));
    await user.click(retryIn(banner));

    expect(await screen.findByText('Nhóm Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được danh bạ workspace')).not.toBeInTheDocument();
  });

  it('403: nói rõ không có quyền, KHÔNG có nút "Thử lại"', async () => {
    server.use(http.get('*/admin/workspaces', forbidden));
    renderWithRouter(<WorkspaceListPage />, '/workspace');

    expect(await screen.findByText('Không tải được danh bạ workspace')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản của bạn không có quyền xem mục này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('hai bộ lọc có tên truy cập (không chỉ "combobox" trần)', async () => {
    server.use(http.get('*/admin/workspaces', () => okBody([WORKSPACE], META)));
    renderWithRouter(<WorkspaceListPage />, '/workspace');
    await screen.findByText('Nhóm Alpha');

    expect(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sắp xếp danh sách' })).toBeInTheDocument();
  });
});

describe('WorkspaceDetailPage', () => {
  function renderPage() {
    const router = createMemoryRouter(
      [
        {
          path: '/workspace/:id',
          // Tên workspace + nút quay lại nằm trên THANH HEADER (portal) — harness dựng đích portal cho page render riêng lẻ.
          element: (
            <HeaderSlotsHarness>
              <WorkspaceDetailPage />
            </HeaderSlotsHarness>
          ),
          handle: { modulePath: '/workspace' },
        },
      ],
      { initialEntries: ['/workspace/ws-1?tab=reports'] },
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  }

  it('404: "không còn tồn tại", KHÔNG có "Thử lại" — bấm lại vẫn 404', async () => {
    server.use(http.get('*/admin/workspaces/:id', notFound));
    renderPage();

    expect(await screen.findByText('Không tải được workspace')).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu này không còn tồn tại hoặc đã bị gỡ.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    // Nhánh lỗi vẫn có thanh header: nút quay lại là LINK thật về danh sách (đúng `modulePath`).
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: 'Về danh sách workspace' }),
    ).toHaveAttribute('href', '/workspace');
  });

  it('lỗi 500: banner + "Thử lại"; thử lại khi BE hồi phục hiện tên workspace và các tab', async () => {
    server.use(http.get('*/admin/workspaces/:id', fail));
    const user = userEvent.setup();
    renderPage();

    const banner = await waitFor(() => alertTitled('Không tải được workspace'));

    server.use(http.get('*/admin/workspaces/:id', () => okBody(DETAIL)));
    await user.click(retryIn(banner));

    // Tên workspace là `<h1>` trên thanh header, không còn dòng tiêu đề trong thân trang.
    expect(
      await within(screen.getByRole('banner')).findByRole('heading', { level: 1, name: 'Nhóm Alpha' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Không tải được workspace')).not.toBeInTheDocument();
  });
});

describe('WorkspaceMembersTab', () => {
  const renderTab = () => renderWithRouter(<WorkspaceMembersTab workspaceId="ws-1" />, '/');

  it('lỗi 500: banner + "Thử lại", thẻ số là "—" (không phải 0), không vẽ "Không có thành viên nào"', async () => {
    // Ba thẻ đếm đọc `access-summary` (không phải danh sách) — cho cả hai cùng lỗi.
    server.use(
      http.get('*/admin/workspaces/:id/members', fail),
      http.get('*/admin/workspaces/:id/access-summary', fail),
    );
    const user = userEvent.setup();
    renderTab();

    const banner = await waitFor(() => alertTitled('Không tải được danh sách thành viên'));
    expect(counts('Thành viên ACTIVE')).toHaveTextContent('—');
    expect(counts('Bị chặn')).toHaveTextContent('—');
    expect(counts('Link mời đang hoạt động')).toHaveTextContent('—');
    expect(screen.queryByText('Không có thành viên nào khớp bộ lọc')).not.toBeInTheDocument();

    // Danh sách và khối "yêu cầu chờ duyệt" cùng đọc `GET …/members` — khối cuối không có ai; số đếm lấy từ `access-summary`.
    server.use(
      http.get('*/admin/workspaces/:id/members', ({ request }) =>
        new URL(request.url).searchParams.get('status') === 'PENDING'
          ? okBody([], { ...META, total: 0 })
          : okBody([MEMBER], { ...META, total: 4 }),
      ),
      http.get('*/admin/workspaces/:id/access-summary', () => okBody(ACCESS_SUMMARY)),
    );
    await user.click(retryIn(banner));

    expect(await screen.findByText('Trưởng nhóm Nam')).toBeInTheDocument();
    // "Thử lại" tải lại cả ba thẻ đếm chứ không chỉ bảng — nếu không thẻ vẫn kẹt "—" dù bảng đã hiện.
    await waitFor(() => expect(counts('Thành viên ACTIVE')).toHaveTextContent('4'));
    expect(counts('Bị chặn')).toHaveTextContent('1');
    expect(counts('Link mời đang hoạt động')).toHaveTextContent('2');
    expect(screen.queryByText('Không tải được yêu cầu chờ duyệt')).not.toBeInTheDocument();
  });

  it('bộ lọc vai trò / trạng thái / sắp xếp có tên truy cập', async () => {
    server.use(http.get('*/admin/workspaces/:id/members', () => okBody([MEMBER], META)));
    renderTab();
    await screen.findByText('Trưởng nhóm Nam');

    expect(screen.getByRole('combobox', { name: 'Lọc theo vai trò' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sắp xếp danh sách' })).toBeInTheDocument();
  });
});

describe('WorkspaceChannelsTab', () => {
  it('lỗi 500: banner + "Thử lại", ba thẻ số là "—"; thử lại hiện kênh và số thật', async () => {
    server.use(http.get('*/admin/workspaces/:id/channels', fail));
    const user = userEvent.setup();
    renderWithRouter(<WorkspaceChannelsTab workspaceId="ws-1" />);

    const banner = await waitFor(() => alertTitled('Không tải được danh sách kênh'));
    for (const label of ['Kênh công khai đang hoạt động', 'Kênh riêng tư', 'Kênh đã lưu trữ']) {
      expect(counts(label)).toHaveTextContent('—');
    }
    expect(screen.queryByText('Không có kênh công khai nào khớp bộ lọc')).not.toBeInTheDocument();

    server.use(http.get('*/admin/workspaces/:id/channels', () => okBody(CHANNELS)));
    await user.click(retryIn(banner));

    expect(await screen.findByText('chung')).toBeInTheDocument();
    await waitFor(() => expect(counts('Kênh riêng tư')).toHaveTextContent('6'));
  });

  it('bộ lọc trạng thái / loại có tên truy cập', async () => {
    server.use(http.get('*/admin/workspaces/:id/channels', () => okBody(CHANNELS)));
    renderWithRouter(<WorkspaceChannelsTab workspaceId="ws-1" />);
    await screen.findByText('chung');

    expect(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lọc theo loại kênh' })).toBeInTheDocument();
  });
});

describe('WorkspaceConversationsTab', () => {
  const renderTab = () => renderWithRouter(<WorkspaceConversationsTab workspaceId="ws-1" />);

  it('lỗi 500: banner + "Thử lại", bốn thẻ số là "—" (không phải 0); thử lại hiện nhóm và số thật', async () => {
    server.use(http.get('*/admin/workspaces/:id/conversations', fail));
    const user = userEvent.setup();
    renderTab();

    const banner = await waitFor(() => alertTitled('Không tải được danh sách nhóm chat'));
    for (const label of [
      'Nhóm chat',
      'Nhóm hoạt động 7 ngày',
      'Số cặp nhắn 1-1 có thành viên workspace',
      'Tin nhắn nhóm 7 ngày',
    ]) {
      expect(counts(label)).toHaveTextContent('—');
    }
    expect(screen.queryByText('Workspace chưa có nhóm chat')).not.toBeInTheDocument();

    server.use(http.get('*/admin/workspaces/:id/conversations', () => okBody(CONVERSATIONS)));
    await user.click(retryIn(banner));

    // Mã nhóm hiện bản rút gọn (6 ký tự cuối của id) và số thành viên có dấu phân tách nghìn.
    expect(await screen.findByRole('button', { name: '#3a4b5c' })).toBeInTheDocument();
    expect(screen.getByText('1.234')).toBeInTheDocument();
    await waitFor(() => expect(counts('Nhóm hoạt động 7 ngày')).toHaveTextContent('1'));
  });

  it('bộ lọc trạng thái có tên truy cập', async () => {
    server.use(http.get('*/admin/workspaces/:id/conversations', () => okBody(CONVERSATIONS)));
    renderTab();
    await screen.findByText('1.234');

    expect(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' })).toBeInTheDocument();
  });
});

describe('WorkspaceOverviewTab', () => {
  it('lỗi tải số liệu hoạt động: khối biểu đồ báo lỗi + "Thử lại" (không phải "Chưa có dữ liệu"); số 30 ngày có dấu nghìn', async () => {
    server.use(http.get('*/admin/workspaces/:id/stats', fail));
    const user = userEvent.setup();
    renderWithRouter(<WorkspaceOverviewTab detail={DETAIL} />);

    const banner = await waitFor(() => alertTitled('Không tải được số liệu hoạt động'));
    expect(screen.queryByText('Chưa có dữ liệu')).not.toBeInTheDocument();
    // Số tin nhắn 30 ngày qua `formatNumber` — "12.345", không phải "12345".
    expect(screen.getByText('12.345')).toBeInTheDocument();

    server.use(http.get('*/admin/workspaces/:id/stats', () => okBody(STATS_DAYS)));
    await user.click(retryIn(banner));

    await waitFor(() =>
      expect(screen.queryByText('Không tải được số liệu hoạt động')).not.toBeInTheDocument(),
    );
  });
});
