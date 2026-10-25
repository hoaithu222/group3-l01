/**
 * Drawer người dùng (`UserDetailDrawer`):
 *  - khoá / mở khoá / đổi vai trò bị khoá KÈM chú thích khi BE chắc chắn từ chối (409 chờ xoá · đã ẩn
 *    danh hoá, 400 chính mình) — không để quản trị viên bấm rồi ăn lỗi;
 *  - 409 vẫn nói đúng nghĩa khi trạng thái đổi giữa chừng (KHÔNG phải "Tài nguyên đã tồn tại");
 *  - tải hồ sơ có đủ trạng thái đang tải / lỗi + "Thử lại" (trước đây drawer để trống, mất cả nút đóng);
 *  - lời xác nhận xoá nói đúng hậu quả của đường ân hạn.
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
import {
  CHANGE_ROLE_SELF_REASON,
  LOCK_BLOCKED_REASON,
} from '@/features/user/constants/user.constants';
import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

interface MockUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'user';
  status: 'ACTIVE' | 'LOCKED' | 'PENDING_DELETION' | 'ANONYMIZED';
  emailVerified: boolean;
  deletionGraceUntil?: string | null;
  createdAt: string;
}

const makeUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: 'u1',
  email: 'nguyen.van.an@congty.vn',
  name: 'Nguyễn Văn An',
  role: 'user',
  status: 'ACTIVE',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** "BE" giả có trạng thái: `current` đổi được giữa các lần gọi (vd người khác vừa đặt lịch xoá). */
let current: MockUser;

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
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function signInAs(id: string, role: 'admin' | 'manager', permissions: string[]) {
  useAuthStore.getState().setAuth({
    user: { id, email: `${role}@congty.vn`, name: 'Người thao tác', roles: [role], permissions },
    token: 'test-token',
  });
}

beforeEach(() => {
  current = makeUser();
  useAuthStore.getState().clearAuth();
  useToastStore.setState({ toasts: [] });
  signInAs('me', 'admin', ['user:view', 'user:update', 'user:delete']);
});

function renderDrawer(userId = 'u1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/user']}>
        <UserDetailDrawer userId={userId} onClose={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);
const lockButton = () => screen.findByRole('button', { name: 'Khoá tài khoản' });

describe('khoá / mở khoá bị khoá khi BE chắc chắn từ chối', () => {
  it('đang chờ xoá: nút Khoá bị khoá, chú thích nói vì sao và gắn vào nút bằng aria-describedby', async () => {
    current = makeUser({
      status: 'PENDING_DELETION',
      deletionGraceUntil: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    });
    renderDrawer();

    const lock = await lockButton();
    expect(lock).toBeDisabled();
    expect(lock).toHaveAccessibleDescription(LOCK_BLOCKED_REASON.PENDING_DELETION);
    expect(screen.getByText(LOCK_BLOCKED_REASON.PENDING_DELETION)).toBeInTheDocument();
    // Luồng đúng cho ca này đã có sẵn: banner + nút huỷ yêu cầu xoá.
    expect(screen.getByText('Đang chờ xoá tài khoản')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Huỷ yêu cầu xoá' })).toBeEnabled();
  });

  it('đã ẩn danh hoá: nút Khoá bị khoá kèm chú thích', async () => {
    current = makeUser({ status: 'ANONYMIZED' });
    renderDrawer();

    const lock = await lockButton();
    expect(lock).toBeDisabled();
    expect(lock).toHaveAccessibleDescription(LOCK_BLOCKED_REASON.ANONYMIZED);
  });

  it('đang bị khoá: nút Mở khoá dùng được, không có chú thích chặn', async () => {
    current = makeUser({ status: 'LOCKED' });
    renderDrawer();

    const unlock = await screen.findByRole('button', { name: 'Mở khoá tài khoản' });
    expect(unlock).toBeEnabled();
    expect(screen.queryByText(LOCK_BLOCKED_REASON.PENDING_DELETION)).not.toBeInTheDocument();
    expect(screen.queryByText(LOCK_BLOCKED_REASON.ANONYMIZED)).not.toBeInTheDocument();
  });

  it('người khác đang hoạt động: cả Khoá lẫn Đổi vai trò dùng được, không chú thích', async () => {
    renderDrawer();

    expect(await lockButton()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Đổi vai trò' })).toBeEnabled();
    expect(screen.queryByText(LOCK_BLOCKED_REASON.SELF)).not.toBeInTheDocument();
    expect(screen.queryByText(CHANGE_ROLE_SELF_REASON)).not.toBeInTheDocument();
  });

  it('chính mình: không tự khoá, không tự đổi vai trò (BE trả 400) — kèm chú thích', async () => {
    signInAs('u1', 'admin', ['user:view', 'user:update', 'user:delete']);
    renderDrawer();

    const lock = await lockButton();
    expect(lock).toBeDisabled();
    expect(lock).toHaveAccessibleDescription(LOCK_BLOCKED_REASON.SELF);
    const role = screen.getByRole('button', { name: 'Đổi vai trò' });
    expect(role).toBeDisabled();
    expect(role).toHaveAccessibleDescription(CHANGE_ROLE_SELF_REASON);
  });
});

describe('409 khi trạng thái đổi giữa chừng', () => {
  it('khoá tài khoản vừa bị người khác đặt lịch xoá → câu đúng nghĩa, modal giữ mở, drawer làm mới thành chú thích', async () => {
    server.use(
      http.post('*/users/:id/lock', () => {
        // Người khác vừa đặt lịch xoá: BE từ chối và từ giờ `GET` trả trạng thái mới.
        current = makeUser({
          status: 'PENDING_DELETION',
          deletionGraceUntil: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        });
        return HttpResponse.json(
          {
            success: false,
            error: {
              code: 'RES_002',
              message: 'Không thể khoá tài khoản đang chờ xoá — hãy huỷ yêu cầu xoá trước',
            },
          },
          { status: 409 },
        );
      }),
    );
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await lockButton());
    const dialog = within(await screen.findByRole('dialog', { name: /Khoá tài khoản — / }));
    await user.type(dialog.getByLabelText(/^Lý do/), 'Vi phạm quy định cộng đồng');
    await user.click(dialog.getByRole('button', { name: 'Khoá tài khoản' }));

    await waitFor(() =>
      expect(toastTitles()).toEqual([
        expect.stringContaining('đang chờ xoá hoặc đã ẩn danh hoá'),
      ]),
    );
    expect(toastTitles()).not.toContain(ERROR_CODE_MESSAGES.RES_002);
    // Mutation reject ⇒ ConfirmWithReasonModal giữ mở để người thao tác đọc và đóng.
    expect(screen.getByRole('dialog', { name: /Khoá tài khoản — / })).toBeInTheDocument();
    // Dữ liệu cũ đã được làm mới: nút Khoá chuyển thành bị khoá + chú thích.
    expect(await screen.findByText(LOCK_BLOCKED_REASON.PENDING_DELETION)).toBeInTheDocument();
  });
});

describe('tải hồ sơ người dùng', () => {
  it('đang tải: có khung xương, KHÔNG để trống', async () => {
    renderDrawer();
    // Đồng bộ ngay sau render — dữ liệu chưa về.
    expect(screen.getAllByRole('status', { name: 'Đang tải' }).length).toBeGreaterThan(0);
    expect(await lockButton()).toBeInTheDocument();
  });

  it('lỗi: báo lỗi + "Thử lại", vẫn còn tiêu đề và nút đóng; thử lại thành công thì hiện hồ sơ', async () => {
    server.use(
      http.get('*/users/:id', () =>
        HttpResponse.json(
          { success: false, error: { code: 'SYS_500', message: 'Lỗi máy chủ' } },
          { status: 500 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderDrawer();

    expect(await screen.findByText('Không tải được hồ sơ người dùng')).toBeInTheDocument();
    // Trước đây `title=''` làm Drawer bỏ cả phần đầu — không có nút đóng, không có tên hộp thoại.
    expect(screen.getByRole('dialog', { name: 'Chi tiết người dùng' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument();

    server.resetHandlers();
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await lockButton()).toBeInTheDocument();
    expect(screen.queryByText('Không tải được hồ sơ người dùng')).not.toBeInTheDocument();
  });
});

describe('xoá tài khoản — lời xác nhận nói đúng hậu quả (đường ân hạn)', () => {
  it('mặc định "Đặt lịch xoá": nói rõ đăng xuất ngay, ân hạn, ẩn danh hoá không hoàn tác, có thể huỷ', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Xoá tài khoản' }));
    const dialog = within(await screen.findByRole('dialog', { name: /Xoá tài khoản — / }));

    expect(dialog.getByText(/đăng xuất khỏi mọi thiết bị ngay/)).toBeInTheDocument();
    expect(dialog.getByText(/thời gian ân hạn/)).toBeInTheDocument();
    expect(dialog.getByText(/không thể hoàn tác/)).toBeInTheDocument();
    expect(dialog.getByText(/có thể huỷ yêu cầu/)).toBeInTheDocument();
    // Nút xác nhận gọi đúng tên việc sẽ xảy ra — không phải "Xoá tài khoản" chung chung.
    expect(dialog.getByRole('button', { name: 'Đặt lịch xoá' })).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Xoá tài khoản' })).not.toBeInTheDocument();
  });

  it('chọn "Ẩn danh hoá ngay": nút đổi tên và bị khoá tới khi gõ đúng email xác nhận', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('button', { name: 'Xoá tài khoản' }));
    const dialog = within(await screen.findByRole('dialog', { name: /Xoá tài khoản — / }));

    await user.click(dialog.getByRole('radio', { name: /Ẩn danh hoá ngay/ }));
    const confirm = await dialog.findByRole('button', { name: 'Ẩn danh hoá ngay' });
    expect(confirm).toBeDisabled();

    await user.type(dialog.getByLabelText(/Gõ lại email/), current.email);
    await waitFor(() => expect(confirm).toBeEnabled());
  });
});
