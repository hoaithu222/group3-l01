/**
 * Drawer người dùng, tab Hồ sơ — gỡ ảnh đại diện VI PHẠM (`POST /admin/users/:id/avatar/remove`, body `{ reason }`):
 *  - có `user:update` + người dùng đang có ảnh (`avatarUrl` là URL ký sẵn) ⇒ nút "Gỡ ảnh đại diện"; xác nhận có lý do
 *    ⇒ gọi đúng endpoint, toast, hồ sơ làm mới (BE trả `avatarUrl: null` ⇒ nút biến mất);
 *  - thiếu quyền / chưa đặt ảnh ⇒ không có nút.
 *
 * Mock ở tầng HTTP (MSW). Radix Avatar không mount `<img>` trong jsdom nên chỉ kiểm nút/hành vi, không kiểm thẻ ảnh.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import UserDetailDrawer from '@/features/user/components/UserDetailDrawer';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

interface MockUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'user';
  status: 'ACTIVE';
  emailVerified: boolean;
  avatarUrl: string | null;
  createdAt: string;
}

const AVATAR_URL = 'https://api.superapp.test/api/v1/assets/as-1/image?v=THUMB&e=1790000000&s=abc';

const makeUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: 'u1',
  email: 'nguyen.van.an@congty.vn',
  name: 'Nguyễn Văn An',
  role: 'user',
  status: 'ACTIVE',
  emailVerified: true,
  avatarUrl: AVATAR_URL,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** "BE" giả có trạng thái: gỡ ảnh xong thì `GET /users/:id` trả `avatarUrl: null`. */
let current: MockUser;
const removeCalls: Array<{ id: string; body: unknown }> = [];

const server = setupServer(
  http.get('*/capabilities', () =>
    HttpResponse.json({
      success: true,
      data: {
        version: 't',
        features: {},
        limits: {},
        upload: { maxFileBytes: 1, allowedMime: [], signedUrlTtlSeconds: 1 },
      },
    }),
  ),
  http.get('*/users/:id', () => HttpResponse.json({ success: true, data: current })),
  http.post('*/admin/users/:id/avatar/remove', async ({ params, request }) => {
    removeCalls.push({ id: String(params.id), body: await request.json() });
    current = { ...current, avatarUrl: null };
    return HttpResponse.json({ success: true, data: { removed: true, user: current } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function signInAs(role: 'admin' | 'manager', permissions: string[]) {
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: `${role}@congty.vn`, name: 'Người thao tác', roles: [role], permissions },
    token: 'test-token',
  });
}

beforeEach(() => {
  current = makeUser();
  removeCalls.length = 0;
  useAuthStore.getState().clearAuth();
  useToastStore.setState({ toasts: [] });
  signInAs('admin', ['user:view', 'user:update', 'user:delete']);
});

function renderDrawer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/user']}>
        <UserDetailDrawer userId="u1" onClose={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);
/** Hồ sơ đã tải xong — drawer lấy tên người dùng làm tiêu đề. */
const profileLoaded = () => screen.findByRole('dialog', { name: 'Nguyễn Văn An' });

describe('UserProfileTab — gỡ ảnh đại diện', () => {
  it('có quyền + có ảnh: xác nhận lý do ⇒ POST /admin/users/:id/avatar/remove { reason }, toast, nút biến mất', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Gỡ ảnh đại diện' }));
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Gỡ ảnh đại diện — Nguyễn Văn An' }),
    );
    await user.type(dialog.getByLabelText(/^Lý do/), 'Ảnh đại diện vi phạm tiêu chuẩn cộng đồng');
    await user.click(dialog.getByRole('button', { name: 'Gỡ ảnh đại diện' }));

    await waitFor(() =>
      expect(removeCalls).toEqual([
        { id: 'u1', body: { reason: 'Ảnh đại diện vi phạm tiêu chuẩn cộng đồng' } },
      ]),
    );
    await waitFor(() => expect(toastTitles()).toContain('Đã gỡ ảnh đại diện và ghi nhật ký'));
    // Hồ sơ làm mới (`avatarUrl: null`) ⇒ không còn gì để gỡ.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Gỡ ảnh đại diện' })).not.toBeInTheDocument(),
    );
  });

  it('thiếu `user:update`: không có nút gỡ dù người dùng có ảnh', async () => {
    signInAs('manager', ['user:view']);
    renderDrawer();

    await profileLoaded();
    expect(screen.queryByRole('button', { name: 'Gỡ ảnh đại diện' })).not.toBeInTheDocument();
  });

  it('có quyền nhưng người dùng chưa đặt ảnh: không có nút gỡ', async () => {
    current = makeUser({ avatarUrl: null });
    renderDrawer();

    await profileLoaded();
    expect(await screen.findByRole('button', { name: 'Khoá tài khoản' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gỡ ảnh đại diện' })).not.toBeInTheDocument();
    expect(removeCalls).toEqual([]);
  });
});
