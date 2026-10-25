/**
 * Bộ lọc `ownerId` và khoảng ngày tạo của danh bạ workspace (p1-01 admin.md §2.1) — BE `GET /admin/workspaces`
 * nhận `ownerId`/`createdFrom`/`createdTo` (`admin-list-workspaces-query.dto.ts`). Mọi bộ lọc sống trên URL;
 * ô chọn chủ sở hữu tìm người dùng phía server (`GET /users?q=`), cần `user:view`.
 *
 * Mock ở tầng HTTP (MSW) — đi đúng đường thật (axios, React Query, `useQueryParams`, debounce).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import WorkspaceListPage from '@/features/workspace/pages/WorkspaceListPage';
import { matchesSearch } from '@/shared/utils/format/string.utils';

const OWNER_AN = '665f1c2e8a1b2c3d4e5f6a11';
const OWNER_BINH = '665f1c2e8a1b2c3d4e5f6a22';

const USERS = [
  { id: OWNER_AN, name: 'Nguyễn Văn An', email: 'nguyen.van.an@congty.vn' },
  { id: OWNER_BINH, name: 'Trần Thị Bình', email: 'tran.thi.binh@congty.vn' },
];

const workspace = (id: string, name: string, owner: { id: string; name: string }) => ({
  id,
  name,
  avatarUrl: null,
  coverUrl: null,
  coverThumbUrl: null,
  coverPreset: null,
  owner,
  memberCount: 5,
  status: 'ACTIVE',
  createdAt: '2026-09-02T03:00:00.000Z',
  lastActivityAt: '2026-09-20T03:00:00.000Z',
});

const WORKSPACES = [
  workspace('w1', 'Nhóm Alpha', { id: OWNER_AN, name: 'Nguyễn Văn An' }),
  workspace('w2', 'Nhóm Beta', { id: OWNER_BINH, name: 'Trần Thị Bình' }),
];

const listCalls: URLSearchParams[] = [];
const userCalls: URLSearchParams[] = [];

const server = setupServer(
  http.get('*/admin/workspaces', ({ request }) => {
    const q = new URL(request.url).searchParams;
    listCalls.push(q);
    const owner = q.get('ownerId');
    const rows = owner ? WORKSPACES.filter((w) => w.owner.id === owner) : WORKSPACES;
    return HttpResponse.json({
      success: true,
      data: rows,
      meta: { page: 1, limit: 20, total: rows.length, totalPages: 1, hasNext: false, hasPrev: false },
    });
  }),
  http.get('*/users', ({ request }) => {
    const q = new URL(request.url).searchParams;
    userCalls.push(q);
    const term = q.get('q');
    const rows = term ? USERS.filter((u) => matchesSearch([u.name, u.email], term)) : USERS;
    return HttpResponse.json({
      success: true,
      data: rows,
      meta: { page: 1, limit: 20, total: rows.length, totalPages: 1, hasNext: false, hasPrev: false },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function signIn(permissions: string[]) {
  useAuthStore.getState().clearAuth();
  // Vai KHÔNG phải `admin` — `admin` vượt mọi kiểm quyền chi tiết nên sẽ che lỗi phân quyền.
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'ops@congty.vn', name: 'Vận hành', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

function renderPage(entry = '/workspace') {
  const router = createMemoryRouter(
    [
      { path: '/workspace', element: <WorkspaceListPage /> },
      { path: '/workspace/:id', element: <div>Chi tiết workspace</div> },
    ],
    { initialEntries: [entry] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, search: () => new URLSearchParams(router.state.location.search) };
}

const lastList = () => listCalls[listCalls.length - 1];
const ownerButton = (label = 'Mọi chủ sở hữu') =>
  screen.findByRole('button', { name: `Lọc theo chủ sở hữu: ${label}` });

beforeEach(() => {
  listCalls.length = 0;
  userCalls.length = 0;
  signIn(['workspace:view', 'user:view']);
});

describe('lọc theo chủ sở hữu', () => {
  it('mặc định không lọc: request không mang ownerId/createdFrom/createdTo; nút hiện "Mọi chủ sở hữu"', async () => {
    renderPage();

    await screen.findByText('Nhóm Alpha');
    await ownerButton();
    for (const key of ['ownerId', 'createdFrom', 'createdTo']) {
      expect(lastList().has(key)).toBe(false);
    }
    // Chưa mở hộp chọn thì chưa gọi API người dùng.
    expect(userCalls).toHaveLength(0);
  });

  it('mở hộp → tìm người dùng phía server → chọn: URL có ownerId, request lọc đúng, nút hiện tên chủ', async () => {
    const user = userEvent.setup();
    const { search } = renderPage('/workspace?page=3');
    await screen.findByText('Nhóm Alpha');

    await user.click(await ownerButton());
    await user.type(await screen.findByLabelText(/Tìm chủ sở hữu/), 'binh');
    await waitFor(() => expect(userCalls.some((c) => c.get('q') === 'binh')).toBe(true), {
      timeout: 3000,
    });
    // Người khác tên không nằm trong kết quả tìm.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Nguyễn Văn An/ })).not.toBeInTheDocument(),
    );

    await user.click(await screen.findByRole('button', { name: /Trần Thị Bình/ }));

    await waitFor(() => expect(search().get('ownerId')).toBe(OWNER_BINH));
    // Đổi bộ lọc → về trang 1 (`page=3` không còn).
    expect(search().get('page') ?? '1').toBe('1');
    await waitFor(() => expect(lastList().get('ownerId')).toBe(OWNER_BINH));
    expect(await screen.findByText('Nhóm Beta')).toBeInTheDocument();
    expect(screen.queryByText('Nhóm Alpha')).not.toBeInTheDocument();
    // Tên lấy từ hàng đã tải (URL chỉ mang id).
    expect(await ownerButton('Trần Thị Bình')).toBeInTheDocument();
  });

  it('bỏ chọn ("Mọi chủ sở hữu") → xoá ownerId khỏi URL và khỏi request', async () => {
    const user = userEvent.setup();
    const { search } = renderPage(`/workspace?ownerId=${OWNER_AN}`);
    await screen.findByText('Nhóm Alpha');

    await user.click(await ownerButton('Nguyễn Văn An'));
    await user.click(await screen.findByRole('button', { name: 'Mọi chủ sở hữu' }));

    await waitFor(() => expect(search().has('ownerId')).toBe(false));
    await waitFor(() => expect(lastList().has('ownerId')).toBe(false));
    expect(await screen.findByText('Nhóm Beta')).toBeInTheDocument();
  });

  it('mở trang từ link `?ownerId=` → request lọc ngay', async () => {
    renderPage(`/workspace?ownerId=${OWNER_AN}`);

    expect(await screen.findByText('Nhóm Alpha')).toBeInTheDocument();
    expect(listCalls[0].get('ownerId')).toBe(OWNER_AN);
  });

  it('ownerId sai định dạng trên URL → KHÔNG gửi lên BE (BE sẽ trả 400)', async () => {
    renderPage('/workspace?ownerId=khong-phai-objectid');

    await screen.findByText('Nhóm Alpha');
    expect(listCalls.every((c) => !c.has('ownerId'))).toBe(true);
  });

  it('thiếu user:view: không có hộp chọn, nhưng link `?ownerId=` vẫn lọc và hiện thành huy hiệu', async () => {
    signIn(['workspace:view']);
    renderPage(`/workspace?ownerId=${OWNER_AN}`);

    expect(await screen.findByText('Nhóm Alpha')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Lọc theo chủ sở hữu/ })).not.toBeInTheDocument();
    expect(await screen.findByText('Chủ sở hữu: Nguyễn Văn An')).toBeInTheDocument();
    expect(listCalls[0].get('ownerId')).toBe(OWNER_AN);
    expect(userCalls).toHaveLength(0);
  });
});

describe('lọc theo khoảng ngày tạo', () => {
  it('gõ khoảng ngày → URL createdFrom/createdTo (YYYY-MM-DD) + request là mốc ISO đầu/cuối ngày', async () => {
    const user = userEvent.setup();
    const { search } = renderPage('/workspace?page=2');
    await screen.findByText('Nhóm Alpha');

    await user.type(screen.getByPlaceholderText('Khoảng ngày tạo'), '01/09/2026 - 19/09/2026{Enter}');

    await waitFor(() => {
      expect(search().get('createdFrom')).toBe('2026-09-01');
      expect(search().get('createdTo')).toBe('2026-09-19');
    });
    expect(search().has('page')).toBe(false);
    await waitFor(() => expect(lastList().has('createdFrom')).toBe(true));
    expect(new Date(lastList().get('createdFrom') ?? '').getTime()).toBe(
      new Date(2026, 8, 1, 0, 0, 0, 0).getTime(),
    );
    expect(new Date(lastList().get('createdTo') ?? '').getTime()).toBe(
      new Date(2026, 8, 19, 23, 59, 59, 999).getTime(),
    );
  });

  it('mở trang với URL có sẵn khoảng ngày → request mang mốc ISO ngay, ô chọn hiện đúng khoảng', async () => {
    renderPage('/workspace?createdFrom=2026-09-01&createdTo=2026-09-19');

    await screen.findByText('Nhóm Alpha');
    expect(listCalls[0].get('createdFrom')).toBeTruthy();
    expect(listCalls[0].get('createdTo')).toBeTruthy();
    expect(screen.getByPlaceholderText('Khoảng ngày tạo')).toHaveValue('01/09/2026 - 19/09/2026');
  });

  it('ngày sai định dạng trên URL → bỏ tham số thay vì gửi rác', async () => {
    renderPage('/workspace?createdFrom=hôm-qua&createdTo=abc');

    await screen.findByText('Nhóm Alpha');
    expect(listCalls.every((c) => !c.has('createdFrom') && !c.has('createdTo'))).toBe(true);
  });
});

describe('"Xoá bộ lọc"', () => {
  it('chỉ hiện khi đang lọc; bấm → xoá chủ sở hữu, khoảng ngày, trạng thái, tìm kiếm và về trang 1', async () => {
    const user = userEvent.setup();
    const { search } = renderPage(
      `/workspace?ownerId=${OWNER_AN}&createdFrom=2026-09-01&createdTo=2026-09-19&status=ACTIVE&page=2`,
    );
    await screen.findByText('Nhóm Alpha');

    await user.click(await screen.findByRole('button', { name: 'Xoá bộ lọc' }));

    await waitFor(() => expect(search().toString()).toBe(''));
    await waitFor(() => {
      expect(lastList().has('ownerId')).toBe(false);
      expect(lastList().has('createdFrom')).toBe(false);
    });
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument();
    expect(await screen.findByText('Nhóm Beta')).toBeInTheDocument();
  });

  it('không có bộ lọc nào → không có nút', async () => {
    renderPage();

    await screen.findByText('Nhóm Alpha');
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument();
  });
});
