/**
 * `AnonymizeUserModal` (p0-01 admin.md §2.2, §4) — xoá tài khoản theo hai chế độ:
 *  - `GRACE` (mặc định, chỉ cần `user:delete`) và `NOW` (chỉ vai `admin`, gõ lại đúng email);
 *  - manager KHÔNG thấy lựa chọn NOW (ẩn hẳn, không chỉ disable);
 *  - NOW thiếu/sai email → nút xác nhận khoá, không gửi request; lý do < 10 ký tự → lỗi ở ô lý do;
 *  - BE từ chối (403 `USER_012`, 400 `USER_013`) → thông điệp tiếng Việt, modal giữ mở.
 *
 * Mock ở tầng HTTP (MSW) — đi đúng đường thật: axios interceptor → React Query → hook.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/app/store';
import AnonymizeUserModal from '@/features/user/components/AnonymizeUserModal';
import type { AdminUser } from '@/features/user/types/user.types';
import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

const TARGET: AdminUser = {
  id: 'u1',
  email: 'nguyen.van.an@congty.vn',
  name: 'Nguyễn Văn An',
  role: 'user',
  status: 'ACTIVE',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

interface PostBody {
  mode: 'GRACE' | 'NOW';
  reason: string;
  confirmEmail?: string;
}

let lastPost: PostBody | null = null;
let postCount = 0;

const server = setupServer(
  http.post('*/admin/users/:id/anonymize', async ({ request }) => {
    lastPost = (await request.json()) as PostBody;
    postCount += 1;
    return HttpResponse.json({
      success: true,
      data:
        lastPost.mode === 'NOW'
          ? { status: 'ANONYMIZED', anonymizedAt: '2026-09-26T03:00:00.000Z' }
          : { status: 'PENDING_DELETION', deletionGraceUntil: '2026-10-03T03:00:00.000Z' },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  lastPost = null;
  postCount = 0;
  useAuthStore.getState().clearAuth();
  useToastStore.setState({ toasts: [] });
});

function renderModal(canAnonymizeNow: boolean) {
  const onOpenChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AnonymizeUserModal
        canAnonymizeNow={canAnonymizeNow}
        open
        user={TARGET}
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);
const reasonInput = () => screen.getByLabelText(/^Lý do/);
const confirmButton = (name: string) => screen.findByRole('button', { name });

async function chooseNow(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('radio', { name: /Ẩn danh hoá ngay/ }));
  return screen.findByLabelText(/Gõ lại email/);
}

describe('lựa chọn chế độ theo quyền', () => {
  it('manager (canAnonymizeNow=false): chỉ có "Đặt lịch xoá", KHÔNG có lựa chọn "Ẩn danh hoá ngay"', async () => {
    renderModal(false);

    expect(await screen.findByRole('radio', { name: /Đặt lịch xoá/ })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /Ẩn danh hoá ngay/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    // Không có ô gõ lại email nào để lộ đường NOW.
    expect(screen.queryByLabelText(/Gõ lại email/)).not.toBeInTheDocument();
  });

  it('admin (canAnonymizeNow=true): có cả hai lựa chọn, mặc định là ân hạn', async () => {
    renderModal(true);

    expect(await screen.findByRole('radio', { name: /Đặt lịch xoá/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Ẩn danh hoá ngay/ })).not.toBeChecked();
  });
});

describe('ràng buộc của form', () => {
  it('lý do dưới 10 ký tự → lỗi ở ô lý do, KHÔNG gửi request', async () => {
    const user = userEvent.setup();
    renderModal(false);

    await user.type(reasonInput(), 'ngan qua');
    await user.click(await confirmButton('Đặt lịch xoá'));

    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(postCount).toBe(0);
  });

  it('bỏ trống lý do → báo lý do bắt buộc, KHÔNG gửi request', async () => {
    const user = userEvent.setup();
    renderModal(false);

    await user.click(await confirmButton('Đặt lịch xoá'));

    expect(await screen.findByText('Lý do là bắt buộc')).toBeInTheDocument();
    expect(postCount).toBe(0);
  });

  it('NOW chưa gõ email → nút "Ẩn danh hoá ngay" bị khoá, bấm không gửi request', async () => {
    const user = userEvent.setup();
    renderModal(true);

    await chooseNow(user);
    await user.type(reasonInput(), 'Yêu cầu xoá dữ liệu cá nhân');
    const confirm = await confirmButton('Ẩn danh hoá ngay');

    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(postCount).toBe(0);
  });

  it('NOW gõ sai email (khác chữ hoa/thường hay thiếu ký tự) → vẫn khoá; đúng từng chữ mới mở', async () => {
    const user = userEvent.setup();
    renderModal(true);

    const email = await chooseNow(user);
    await user.type(reasonInput(), 'Yêu cầu xoá dữ liệu cá nhân');
    const confirm = await confirmButton('Ẩn danh hoá ngay');

    await user.type(email, 'Nguyen.Van.An@congty.vn');
    expect(confirm).toBeDisabled();

    await user.clear(email);
    await user.type(email, 'nguyen.van.an@congty.v');
    expect(confirm).toBeDisabled();

    await user.clear(email);
    await user.type(email, TARGET.email);
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(postCount).toBe(0);
  });
});

describe('gửi yêu cầu', () => {
  it('GRACE: gửi { mode, reason } KHÔNG kèm confirmEmail; toast báo lịch xoá và modal đóng', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderModal(true);

    await user.type(reasonInput(), '  Người dùng yêu cầu xoá tài khoản  ');
    await user.click(await confirmButton('Đặt lịch xoá'));

    await waitFor(() => expect(lastPost).not.toBeNull());
    expect(lastPost).toEqual({ mode: 'GRACE', reason: 'Người dùng yêu cầu xoá tài khoản' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastTitles()).toEqual([expect.stringContaining('Đã đặt lịch xoá')]);
  });

  it('NOW + đúng email: gửi kèm confirmEmail; toast báo đã ẩn danh hoá ngay', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderModal(true);

    const email = await chooseNow(user);
    await user.type(email, TARGET.email);
    await user.type(reasonInput(), 'Yêu cầu xoá dữ liệu cá nhân');
    await user.click(await confirmButton('Ẩn danh hoá ngay'));

    await waitFor(() => expect(lastPost).not.toBeNull());
    expect(lastPost).toEqual({
      mode: 'NOW',
      reason: 'Yêu cầu xoá dữ liệu cá nhân',
      confirmEmail: TARGET.email,
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toastTitles()).toEqual(['Đã ẩn danh hoá tài khoản ngay lập tức']);
  });
});

describe('BE từ chối', () => {
  const rejectWith = (status: number, code: string) =>
    server.use(
      http.post('*/admin/users/:id/anonymize', () =>
        HttpResponse.json(
          { success: false, error: { code, message: 'Không được phép' } },
          { status },
        ),
      ),
    );

  it('403 USER_012 (không phải vai admin) → thông điệp tiếng Việt của mã, modal GIỮ MỞ', async () => {
    rejectWith(403, 'USER_012');
    const user = userEvent.setup();
    const { onOpenChange } = renderModal(true);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const email = await chooseNow(user);
    await user.type(email, TARGET.email);
    await user.type(reasonInput(), 'Yêu cầu xoá dữ liệu cá nhân');
    await user.click(await confirmButton('Ẩn danh hoá ngay'));

    await waitFor(() => expect(toastTitles()).toEqual([ERROR_CODE_MESSAGES.USER_012]));
    expect(toastTitles()[0]).toBe('Chỉ quản trị viên cấp cao được ẩn danh ngay lập tức');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(await confirmButton('Ẩn danh hoá ngay')).toBeEnabled();
    errorSpy.mockRestore();
  });

  it('400 USER_013 (BE thấy email xác nhận không khớp) → thông điệp tiếng Việt, modal giữ mở', async () => {
    rejectWith(400, 'USER_013');
    const user = userEvent.setup();
    const { onOpenChange } = renderModal(true);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const email = await chooseNow(user);
    await user.type(email, TARGET.email);
    await user.type(reasonInput(), 'Yêu cầu xoá dữ liệu cá nhân');
    await user.click(await confirmButton('Ẩn danh hoá ngay'));

    await waitFor(() => expect(toastTitles()).toEqual([ERROR_CODE_MESSAGES.USER_013]));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    errorSpy.mockRestore();
  });
});
