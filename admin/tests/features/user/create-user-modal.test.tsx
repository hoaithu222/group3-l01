/**
 * `CreateUserModal` — form khớp chính sách BE (mật khẩu 8–128 KHÔNG bắt buộc chữ hoa/số) và xử lý 409
 * trùng email bằng câu đúng nghĩa (BE trả `RES_002` chung — interceptor sẽ nói "Tài nguyên đã tồn tại").
 *
 * Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/app/store';
import CreateUserModal from '@/features/user/components/CreateUserModal';
import { EMAIL_TAKEN_MESSAGE } from '@/features/user/utils/user-errors';
import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: {
      id: 'me',
      email: 'admin@congty.vn',
      name: 'Admin',
      roles: ['admin'],
      permissions: ['user:view', 'user:create'],
    },
    token: 'test-token',
  });
  useToastStore.setState({ toasts: [] });
});

function renderModal(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CreateUserModal open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

async function fill(user: ReturnType<typeof userEvent.setup>, password: string) {
  await user.type(await screen.findByLabelText(/^Họ tên/), 'Nguyễn Văn An');
  await user.type(screen.getByLabelText(/^Email/), 'nguyen.van.an@congty.vn');
  await user.type(screen.getByLabelText(/^Mật khẩu/), password);
}

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);

describe('mật khẩu 8–128, không bắt buộc chữ hoa/số', () => {
  it('8 ký tự toàn chữ thường được gửi lên (trước đây form chặn: "Phải có chữ hoa")', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('*/users', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true, data: { id: 'u9', ...body } }, { status: 201 });
      }),
      http.get('*/users', () => HttpResponse.json({ success: true, data: [], meta: {} })),
    );
    const user = userEvent.setup();
    const { onOpenChange } = renderModal();

    await fill(user, 'abcdefgh');
    await user.click(screen.getByRole('button', { name: 'Tạo người dùng' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ email: 'nguyen.van.an@congty.vn', password: 'abcdefgh' });
    await waitFor(() => expect(toastTitles()).toContain('Đã tạo người dùng'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('7 ký tự → lỗi ngay dưới ô, KHÔNG gọi API', async () => {
    let called = false;
    server.use(
      http.post('*/users', () => {
        called = true;
        return HttpResponse.json({ success: true, data: {} }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderModal();

    await fill(user, 'abcdefg');
    await user.click(screen.getByRole('button', { name: 'Tạo người dùng' }));

    expect(await screen.findByText('Mật khẩu tối thiểu 8 ký tự')).toBeInTheDocument();
    expect(called).toBe(false);
  });
});

describe('409 trùng email', () => {
  it('toast + lỗi gắn vào ô email bằng câu đúng nghĩa; modal giữ mở', async () => {
    server.use(
      http.post('*/users', () =>
        HttpResponse.json(
          { success: false, error: { code: 'RES_002', message: 'Email đã tồn tại' } },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    const { onOpenChange } = renderModal();

    await fill(user, 'matkhau-du-dai');
    await user.click(screen.getByRole('button', { name: 'Tạo người dùng' }));

    await waitFor(() => expect(toastTitles()).toEqual([EMAIL_TAKEN_MESSAGE]));
    expect(toastTitles()).not.toContain(ERROR_CODE_MESSAGES.RES_002);
    // Cùng câu hiện ngay dưới ô email (không chỉ toast — `interaction-ux.md §6`).
    expect(await screen.findAllByText(EMAIL_TAKEN_MESSAGE)).not.toHaveLength(0);
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
