/**
 * `UserListPage` — bảng render đúng dữ liệu, tìm kiếm IME-safe khớp có dấu, và
 * quyền chi tiết (đổi vai trò CHỈ vai `admin`) được tôn trọng trong drawer.
 *
 * Mock ở tầng HTTP (MSW) — KHÔNG mock service/queries — để đi đúng đường thật
 * (axios interceptor, `useQueryParams`, debounce).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import UserListPage from '@/features/user/pages/UserListPage';
import { matchesSearch } from '@/shared/utils/format/string.utils';

interface MockUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'user';
  status: 'ACTIVE' | 'LOCKED' | 'PENDING_DELETION' | 'ANONYMIZED';
  emailVerified: boolean;
  createdAt: string;
}

const USERS: MockUser[] = [
  {
    id: 'u1',
    email: 'nguyen.van.an@congty.vn',
    name: 'Nguyễn Văn An',
    role: 'user',
    status: 'ACTIVE',
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'u2',
    email: 'tran.thi.binh@congty.vn',
    name: 'Trần Thị Bình',
    role: 'manager',
    status: 'ACTIVE',
    emailVerified: true,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

function listMeta(total: number) {
  return { page: 1, limit: 20, total, totalPages: 1, hasNext: false, hasPrev: false };
}

const server = setupServer(
  http.get('*/users', ({ request }) => {
    const q = new URL(request.url).searchParams.get('q');
    const rows = q ? USERS.filter((u) => matchesSearch([u.name, u.email], q)) : USERS;
    return HttpResponse.json({ success: true, data: rows, meta: listMeta(rows.length) });
  }),
  http.get('*/users/:id', ({ params }) => {
    const user = USERS.find((u) => u.id === params.id);
    if (!user) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ success: true, data: user });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/user']}>
        <UserListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('UserListPage', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
  });

  it('render 2 dòng người dùng từ API', async () => {
    useAuthStore.getState().setAuth({
      user: {
        id: 'me',
        email: 'admin@congty.vn',
        name: 'Admin',
        roles: ['admin'],
        permissions: ['user:view', 'user:update'],
      },
      token: 'test-token',
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument();
      expect(screen.getByText('Trần Thị Bình')).toBeInTheDocument();
    });
  });

  it('gõ "nguyen" (không dấu) tìm ra "Nguyễn Văn An"', async () => {
    useAuthStore.getState().setAuth({
      user: {
        id: 'me',
        email: 'admin@congty.vn',
        name: 'Admin',
        roles: ['admin'],
        permissions: ['user:view', 'user:update'],
      },
      token: 'test-token',
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Trần Thị Bình')).toBeInTheDocument());

    const search = screen.getByPlaceholderText('Tìm theo tên, email…');
    await userEvent.type(search, 'nguyen');

    await waitFor(
      () => {
        expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument();
        expect(screen.queryByText('Trần Thị Bình')).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('lỗi tải danh sách: báo lỗi kèm "Thử lại", KHÔNG vẽ bảng trống "Không có người dùng nào khớp bộ lọc"', async () => {
    useAuthStore.getState().setAuth({
      user: {
        id: 'me',
        email: 'admin@congty.vn',
        name: 'Admin',
        roles: ['admin'],
        permissions: ['user:view', 'user:update'],
      },
      token: 'test-token',
    });
    server.use(
      http.get('*/users', () =>
        HttpResponse.json(
          { success: false, error: { code: 'SYS_500', message: 'Lỗi máy chủ' } },
          { status: 500 },
        ),
      ),
    );
    renderPage();

    expect(await screen.findByText('Không tải được danh sách người dùng')).toBeInTheDocument();
    expect(screen.queryByText('Không có người dùng nào khớp bộ lọc')).not.toBeInTheDocument();

    // Khôi phục "BE" bình thường rồi thử lại.
    server.resetHandlers();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument());
    expect(screen.queryByText('Không tải được danh sách người dùng')).not.toBeInTheDocument();
  });

  it('vai manager (dù có user:update) không thấy nút "Đổi vai trò"', async () => {
    useAuthStore.getState().setAuth({
      user: {
        id: 'me',
        email: 'manager@congty.vn',
        name: 'Quản lý',
        roles: ['manager'],
        // Cấp thẳng `user:update` để cô lập đúng điều kiện đang kiểm: quyền có
        // rồi vẫn phải thiếu vai `admin` mới ẩn — không lẫn với lý do "thiếu
        // quyền update" (ROLE_PERMISSIONS thật của manager còn không có
        // `user:update`, nên test đó sẽ không phân biệt được hai lý do).
        permissions: ['user:view', 'user:update'],
      },
      token: 'test-token',
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Nguyễn Văn An'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Khoá tài khoản' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Đổi vai trò' })).not.toBeInTheDocument();
  });

  it('vai admin thấy đủ nút "Khoá tài khoản" và "Đổi vai trò"', async () => {
    useAuthStore.getState().setAuth({
      user: {
        id: 'me',
        email: 'admin@congty.vn',
        name: 'Admin',
        roles: ['admin'],
        permissions: [],
      },
      token: 'test-token',
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Nguyễn Văn An'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Khoá tài khoản' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Đổi vai trò' })).toBeInTheDocument();
    });
  });
});
