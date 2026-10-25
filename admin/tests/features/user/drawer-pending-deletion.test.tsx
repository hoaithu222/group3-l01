/**
 * Drawer người dùng khi tài khoản đang CHỜ XOÁ (p0-01 admin.md §2.1, §2.3, §4):
 *  - `PendingDeletionCallout` hiện mốc ân hạn + số ngày còn lại (làm tròn LÊN) và nút "Huỷ yêu cầu xoá";
 *  - huỷ yêu cầu qua `ConfirmWithReasonModal` (lý do ≥ 10 ký tự) → `POST /admin/users/:id/anonymize/cancel`;
 *  - không có nút Huỷ / Xoá cho CHÍNH MÌNH (BE 400 `USER_014`), khi thiếu `user:delete`, hoặc sai trạng thái.
 *
 * Mock ở tầng HTTP (MSW) — đi đúng đường thật: axios interceptor → React Query → hook.
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
import type { AdminUser } from '@/features/user/types/user.types';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

const DAY = 24 * 3600 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const makeUser = (overrides: Partial<AdminUser> = {}): AdminUser => ({
  id: 'u1',
  email: 'nguyen.van.an@congty.vn',
  name: 'Nguyễn Văn An',
  role: 'user',
  status: 'PENDING_DELETION',
  emailVerified: true,
  deletionGraceUntil: inDays(5.5),
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

let current: AdminUser;
let lastCancel: { reason: string } | null = null;

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
  http.post('*/admin/users/:id/anonymize/cancel', async ({ request }) => {
    lastCancel = (await request.json()) as { reason: string };
    current = makeUser({ status: 'ACTIVE', deletionGraceUntil: null });
    return HttpResponse.json({ success: true, data: { status: 'ACTIVE' } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** Vai `admin` vượt mọi kiểm quyền chi tiết — ca thiếu quyền phải đăng nhập bằng vai `manager`. */
function signInAs(id: string, permissions: string[], role: 'admin' | 'manager' = 'admin') {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: { id, email: 'admin@congty.vn', name: 'Người thao tác', roles: [role], permissions },
    token: 'test-token',
  });
}

const FULL = ['user:view', 'user:update', 'user:delete'];

beforeEach(() => {
  current = makeUser();
  lastCancel = null;
  useToastStore.setState({ toasts: [] });
  signInAs('me', FULL);
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

const callout = async () => screen.findByText('Đang chờ xoá tài khoản');
const cancelButton = () => screen.queryByRole('button', { name: 'Huỷ yêu cầu xoá' });
const deleteButton = () => screen.queryByRole('button', { name: 'Xoá tài khoản' });

describe('PendingDeletionCallout trong drawer', () => {
  it('PENDING_DELETION: banner cảnh báo + mốc ân hạn + số ngày còn lại (làm tròn lên) + nút huỷ', async () => {
    renderDrawer();

    await callout();
    expect(screen.getByText(/Tự động ẩn danh hoá lúc \d{2}:\d{2} \d{2}\/\d{2}\/\d{4}/)).toBeInTheDocument();
    // 5,5 ngày còn lại → "còn khoảng 6 ngày" (ceil, không phải "5 ngày" gây tưởng còn ít hơn).
    expect(screen.getByText(/còn khoảng 6 ngày/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Huỷ yêu cầu xoá' })).toBeEnabled();
    // Huy hiệu trạng thái ở tab Hồ sơ.
    expect(screen.getByText('Chờ xoá')).toBeInTheDocument();
  });

  it('còn dưới 1 ngày vẫn đọc là "còn khoảng 1 ngày", không phải 0', async () => {
    current = makeUser({ deletionGraceUntil: new Date(Date.now() + 20 * 3600 * 1000).toISOString() });
    renderDrawer();

    await callout();
    expect(screen.getByText(/còn khoảng 1 ngày/)).toBeInTheDocument();
    expect(screen.queryByText(/còn khoảng 0 ngày/)).not.toBeInTheDocument();
  });

  it('quá mốc ân hạn (job chưa chạy) → "sắp hết ân hạn"', async () => {
    current = makeUser({ deletionGraceUntil: new Date(Date.now() - 3600 * 1000).toISOString() });
    renderDrawer();

    await callout();
    expect(screen.getByText(/sắp hết ân hạn/)).toBeInTheDocument();
  });

  it('thiếu deletionGraceUntil → chỉ báo đang chờ xoá, không bịa số ngày', async () => {
    current = makeUser({ deletionGraceUntil: null });
    renderDrawer();

    await callout();
    expect(screen.getByText('Tài khoản đang chờ xoá.')).toBeInTheDocument();
    expect(screen.queryByText(/còn khoảng/)).not.toBeInTheDocument();
  });

  it('tài khoản đang chờ xoá KHÔNG có nút "Xoá tài khoản" (đã có luồng huỷ riêng)', async () => {
    renderDrawer();

    await callout();
    await screen.findByRole('button', { name: 'Khoá tài khoản' });
    expect(deleteButton()).not.toBeInTheDocument();
  });

  it('trạng thái khác (ACTIVE) không có banner và không có nút huỷ', async () => {
    current = makeUser({ status: 'ACTIVE', deletionGraceUntil: null });
    renderDrawer();

    await screen.findByRole('button', { name: 'Khoá tài khoản' });
    expect(screen.queryByText('Đang chờ xoá tài khoản')).not.toBeInTheDocument();
    expect(cancelButton()).not.toBeInTheDocument();
  });
});

describe('huỷ yêu cầu xoá', () => {
  it('lý do < 10 ký tự không gửi; đủ lý do → POST /anonymize/cancel { reason }, toast thành công, banner biến mất', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Huỷ yêu cầu xoá' }));
    const dialog = within(await screen.findByRole('dialog', { name: /Huỷ yêu cầu xoá — / }));

    await user.type(dialog.getByLabelText(/^Lý do/), 'ngan qua');
    await user.click(dialog.getByRole('button', { name: 'Huỷ yêu cầu xoá' }));
    expect(await dialog.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(lastCancel).toBeNull();

    await user.clear(dialog.getByLabelText(/^Lý do/));
    await user.type(dialog.getByLabelText(/^Lý do/), 'Người dùng đổi ý, đã xác minh qua điện thoại');
    await user.click(dialog.getByRole('button', { name: 'Huỷ yêu cầu xoá' }));

    await waitFor(() => expect(lastCancel).not.toBeNull());
    expect(lastCancel).toEqual({ reason: 'Người dùng đổi ý, đã xác minh qua điện thoại' });
    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.title)).toEqual([
        'Đã huỷ yêu cầu xoá tài khoản',
      ]),
    );
    // Hồ sơ được làm mới về ACTIVE: banner biến mất.
    await waitFor(() =>
      expect(screen.queryByText('Đang chờ xoá tài khoản')).not.toBeInTheDocument(),
    );
  });
});

describe('quyền và chính mình', () => {
  it('CHÍNH MÌNH: vẫn thấy banner nhưng KHÔNG có nút huỷ; hồ sơ ACTIVE của chính mình không có nút Xoá', async () => {
    signInAs('u1', FULL);
    renderDrawer();

    await callout();
    await screen.findByRole('button', { name: 'Khoá tài khoản' });
    expect(cancelButton()).not.toBeInTheDocument();
  });

  it('CHÍNH MÌNH ở trạng thái ACTIVE: không có nút "Xoá tài khoản" (BE trả 400 USER_014)', async () => {
    signInAs('u1', FULL);
    current = makeUser({ status: 'ACTIVE', deletionGraceUntil: null });
    renderDrawer();

    await screen.findByRole('button', { name: 'Khoá tài khoản' });
    expect(deleteButton()).not.toBeInTheDocument();
  });

  it('người khác ở trạng thái ACTIVE: có nút "Xoá tài khoản" (đối chứng)', async () => {
    current = makeUser({ status: 'ACTIVE', deletionGraceUntil: null });
    renderDrawer();

    expect(await screen.findByRole('button', { name: 'Xoá tài khoản' })).toBeEnabled();
  });

  it('thiếu user:delete: banner còn nhưng không có nút huỷ, cũng không có nút Xoá', async () => {
    signInAs('me', ['user:view', 'user:update'], 'manager');
    renderDrawer();

    await callout();
    await screen.findByRole('button', { name: 'Khoá tài khoản' });
    expect(cancelButton()).not.toBeInTheDocument();
    expect(deleteButton()).not.toBeInTheDocument();
  });

  it('đã ẩn danh hoá: không có banner chờ xoá, không có nút huỷ/xoá', async () => {
    current = makeUser({ status: 'ANONYMIZED', deletionGraceUntil: null });
    renderDrawer();

    await screen.findByText('Đã ẩn danh');
    expect(screen.queryByText('Đang chờ xoá tài khoản')).not.toBeInTheDocument();
    expect(cancelButton()).not.toBeInTheDocument();
    expect(deleteButton()).not.toBeInTheDocument();
  });
});
