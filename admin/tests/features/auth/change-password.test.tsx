/**
 * Đổi mật khẩu của chính mình — mục "Đổi mật khẩu" trong menu người dùng (trước đây bấm vào chỉ
 * nhảy sang trang Cài đặt, không có form nào).
 *
 * Bất biến:
 *  - ràng buộc mật khẩu MỚI khớp BE (≥ 8 ký tự, có chữ cái, có chữ số, khác mật khẩu cũ);
 *  - gửi đúng `{ currentPassword, newPassword }` (KHÔNG có `confirmPassword`), kèm Bearer;
 *  - 401 = "mật khẩu hiện tại sai": lỗi hiện ngay dưới ô đó, modal giữ mở, KHÔNG bị đăng xuất,
 *    KHÔNG kích làm mới token;
 *  - mật khẩu KHÔNG lọt ra console khi lỗi.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/app/store';
import {
  errorBody,
  OPS_USER,
  renderApp,
  resetAuth,
  sessionBody,
  shellHandlers,
  signIn,
} from './auth-test-utils';

vi.mock('socket.io-client', async () => {
  const { fakeSocket } = await import('../moderation/fake-socket');
  return { io: vi.fn(() => fakeSocket) };
});

let patches: Array<{ auth: string; body: Record<string, unknown> }> = [];
let patchResponder: () => Response | Promise<Response>;
let refreshCalls = 0;

const server = setupServer(
  http.patch('*/auth/change-password', async ({ request }) => {
    patches.push({
      auth: request.headers.get('authorization') ?? '',
      body: (await request.json()) as Record<string, unknown>,
    });
    return patchResponder();
  }),
  http.post('*/auth/refresh', () => {
    refreshCalls += 1;
    return HttpResponse.json(errorBody('AUTH_009'), { status: 401 });
  }),
  ...shellHandlers,
);

beforeAll(() => {
  configure({ asyncUtilTimeout: 8000 });
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
  server.close();
});
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});

/**
 * Hợp đồng BE hiện tại: đổi mật khẩu nâng `sessionVersion` ⇒ token cũ thành `AUTH_004`, nên BE trả
 * kèm access token MỚI cho phiên hiện tại (p0-01 be.md §5).
 */
const changed = (payload: Record<string, unknown> = {}) =>
  HttpResponse.json({
    success: true,
    data: { revokedSessions: 1, accessToken: 'token-moi', tokenType: 'Bearer', ...payload },
  });

beforeEach(() => {
  patches = [];
  refreshCalls = 0;
  patchResponder = () => changed();
});

/** Gom MỌI chuỗi trong một giá trị (kể cả thuộc tính lồng nhau/không đếm được của AxiosError) để tìm bí mật. */
function flatten(value: unknown, seen = new WeakSet<object>(), depth = 0): string {
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object' || depth > 6) return String(value);
  if (seen.has(value)) return '';
  seen.add(value);
  return Object.getOwnPropertyNames(value)
    .map((key) => {
      try {
        return `${key}=${flatten((value as Record<string, unknown>)[key], seen, depth + 1)}`;
      } catch {
        return '';
      }
    })
    .join(' ');
}

const CURRENT = 'Mat-khau-cu-123';
const NEXT = 'Mat-khau-moi-456';

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  signIn(OPS_USER, 'token-cu');
  const utils = renderApp(['/profile']);
  await screen.findByRole('heading', { name: 'Thông tin cá nhân' });
  await user.click(screen.getByRole('button', { name: 'Menu người dùng' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Đổi mật khẩu' }));
  const dialog = await screen.findByRole('dialog', { name: 'Đổi mật khẩu' });
  return { ...utils, dialog };
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  values: { current?: string; next?: string; confirm?: string },
) {
  const q = within(dialog);
  if (values.current !== undefined) {
    await user.type(q.getByLabelText(/^Mật khẩu hiện tại/), values.current);
  }
  if (values.next !== undefined) await user.type(q.getByLabelText(/^Mật khẩu mới/), values.next);
  if (values.confirm !== undefined) {
    await user.type(q.getByLabelText(/^Nhập lại mật khẩu mới/), values.confirm);
  }
}

const submit = (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) =>
  user.click(within(dialog).getByRole('button', { name: 'Đổi mật khẩu' }));

describe('đổi mật khẩu', { timeout: 30_000 }, () => {
  it('mục "Đổi mật khẩu" mở form, KHÔNG nhảy sang trang Cài đặt; ô có autocomplete đúng', async () => {
    const user = userEvent.setup();
    const { router, dialog } = await openDialog(user);

    expect(router.state.location.pathname).toBe('/profile');
    const q = within(dialog);
    expect(q.getByLabelText(/^Mật khẩu hiện tại/)).toHaveAttribute('autocomplete', 'current-password');
    expect(q.getByLabelText(/^Mật khẩu mới/)).toHaveAttribute('autocomplete', 'new-password');
    expect(q.getByLabelText(/^Nhập lại mật khẩu mới/)).toHaveAttribute('autocomplete', 'new-password');
  });

  describe('validate — khớp chính sách của BE, KHÔNG gọi API khi sai', () => {
    it('gửi rỗng ⇒ báo lỗi từng ô', async () => {
      const user = userEvent.setup();
      const { dialog } = await openDialog(user);

      await submit(user, dialog);

      expect(await within(dialog).findByText('Vui lòng nhập mật khẩu hiện tại')).toBeInTheDocument();
      expect(within(dialog).getByText('Mật khẩu mới tối thiểu 8 ký tự')).toBeInTheDocument();
      expect(within(dialog).getByText('Vui lòng nhập lại mật khẩu mới')).toBeInTheDocument();
      expect(patches).toHaveLength(0);
    });

    it.each([
      ['quá ngắn', 'Ab1', 'Mật khẩu mới tối thiểu 8 ký tự'],
      ['thiếu chữ số', 'abcdefghij', 'Mật khẩu mới phải có ít nhất 1 chữ số'],
      ['thiếu chữ cái', '1234567890', 'Mật khẩu mới phải có ít nhất 1 chữ cái'],
    ])('mật khẩu mới %s', async (_label, next, message) => {
      const user = userEvent.setup();
      const { dialog } = await openDialog(user);

      await fill(user, dialog, { current: CURRENT, next, confirm: next });
      await submit(user, dialog);

      expect(await within(dialog).findByText(message)).toBeInTheDocument();
      expect(patches).toHaveLength(0);
    });

    it('nhập lại không khớp ⇒ báo; trùng mật khẩu cũ ⇒ báo', async () => {
      const user = userEvent.setup();
      const { dialog } = await openDialog(user);

      await fill(user, dialog, { current: CURRENT, next: NEXT, confirm: `${NEXT}x` });
      await submit(user, dialog);
      expect(await within(dialog).findByText('Mật khẩu xác nhận không khớp')).toBeInTheDocument();

      await user.clear(within(dialog).getByLabelText(/^Mật khẩu mới/));
      await user.clear(within(dialog).getByLabelText(/^Nhập lại mật khẩu mới/));
      await fill(user, dialog, { next: CURRENT, confirm: CURRENT });
      await submit(user, dialog);
      expect(
        await within(dialog).findByText('Mật khẩu mới phải khác mật khẩu hiện tại'),
      ).toBeInTheDocument();
      expect(patches).toHaveLength(0);
    });
  });

  it('⛔ thành công: gửi { currentPassword, newPassword } kèm Bearer, đóng modal, xoá form, VẪN đăng nhập', async () => {
    const user = userEvent.setup();
    const { dialog } = await openDialog(user);

    await fill(user, dialog, { current: CURRENT, next: NEXT, confirm: NEXT });
    await submit(user, dialog);

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Đổi mật khẩu' })).not.toBeInTheDocument(),
    );
    expect(patches).toEqual([
      { auth: 'Bearer token-cu', body: { currentPassword: CURRENT, newPassword: NEXT } },
    ]);
    expect(await screen.findByText(/Các thiết bị khác đã bị đăng xuất/)).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe('authenticated');

    // Mở lại: mật khẩu vừa nhập KHÔNG được nằm lại trong form.
    await user.click(screen.getByRole('button', { name: 'Menu người dùng' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Đổi mật khẩu' }));
    const reopened = await screen.findByRole('dialog', { name: 'Đổi mật khẩu' });
    expect(within(reopened).getByLabelText(/^Mật khẩu hiện tại/)).toHaveValue('');
    expect(within(reopened).getByLabelText(/^Mật khẩu mới/)).toHaveValue('');
  });

  describe('access token mới do BE cấp kèm phản hồi', () => {
    it('⛔ được NHẬN ngay: token trong store đổi sang token mới, và request kế tiếp dùng nó', async () => {
      const user = userEvent.setup();
      const { dialog } = await openDialog(user);

      await fill(user, dialog, { current: CURRENT, next: NEXT, confirm: NEXT });
      await submit(user, dialog);

      await waitFor(() => expect(useAuthStore.getState().token).toBe('token-moi'));
      expect(useAuthStore.getState().status).toBe('authenticated');
      // Không có vòng 401 → refresh → phát lại nào: token cũ vừa bị BE vô hiệu (AUTH_004) đã được thay sẵn.
      expect(refreshCalls).toBe(0);
    });

    it('BE bản cũ trả data: null ⇒ vẫn báo thành công, giữ token hiện có (không ném lỗi trong onSuccess)', async () => {
      patchResponder = () => HttpResponse.json({ success: true, data: null });
      const user = userEvent.setup();
      const { dialog } = await openDialog(user);

      await fill(user, dialog, { current: CURRENT, next: NEXT, confirm: NEXT });
      await submit(user, dialog);

      expect(await screen.findByText(/Các thiết bị khác đã bị đăng xuất/)).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Đổi mật khẩu' })).not.toBeInTheDocument();
      expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', token: 'token-cu' });
    });

    it('⛔ phiên đã bị dọn lúc phản hồi còn bay (tab khác đăng xuất) ⇒ token mới KHÔNG hồi sinh phiên', async () => {
      patchResponder = () => {
        useAuthStore.getState().clearAuth('expired');
        return changed({ accessToken: 'token-den-tre' });
      };
      const user = userEvent.setup();
      const { dialog } = await openDialog(user);

      await fill(user, dialog, { current: CURRENT, next: NEXT, confirm: NEXT });
      await submit(user, dialog);
      await waitFor(() => expect(patches).toHaveLength(1));
      // Chờ phản hồi đi hết đường về `onSuccess` (cùng tiến trình, vài ms) — không có mốc nào để quan sát "không làm gì".
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', token: null });
    });
  });

  it('⛔ mật khẩu hiện tại sai (401) ⇒ lỗi dưới đúng ô, modal giữ mở, KHÔNG bị đăng xuất, KHÔNG refresh', async () => {
    patchResponder = () =>
      HttpResponse.json(errorBody('AUTH_002', 'Mật khẩu hiện tại không đúng'), { status: 401 });
    const user = userEvent.setup();
    const { dialog } = await openDialog(user);

    await fill(user, dialog, { current: 'sai-mat-khau-1', next: NEXT, confirm: NEXT });
    await submit(user, dialog);

    expect(await within(dialog).findByText('Mật khẩu hiện tại không đúng.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Đổi mật khẩu' })).toBeInTheDocument();
    expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', token: 'token-cu' });
    expect(refreshCalls).toBe(0);
    expect(patches).toHaveLength(1);
  });

  it('BE từ chối mật khẩu mới (400 VAL_001) ⇒ hiện câu lỗi của BE dưới ô mật khẩu mới', async () => {
    patchResponder = () =>
      HttpResponse.json(
        {
          success: false,
          error: {
            code: 'VAL_001',
            message: 'Dữ liệu không hợp lệ',
            details: { newPassword: ['Mật khẩu mới phải chứa ít nhất 1 chữ số'] },
          },
        },
        { status: 400 },
      );
    const user = userEvent.setup();
    const { dialog } = await openDialog(user);

    await fill(user, dialog, { current: CURRENT, next: NEXT, confirm: NEXT });
    await submit(user, dialog);

    expect(
      await within(dialog).findByText('Mật khẩu mới phải chứa ít nhất 1 chữ số'),
    ).toBeInTheDocument();
  });

  it('mất mạng ⇒ khung lỗi chung "kiểm tra kết nối", modal giữ mở', async () => {
    patchResponder = () => HttpResponse.error();
    const user = userEvent.setup();
    const { dialog } = await openDialog(user);

    await fill(user, dialog, { current: CURRENT, next: NEXT, confirm: NEXT });
    await submit(user, dialog);

    expect(await within(dialog).findByText(/Không thể kết nối đến máy chủ/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Đổi mật khẩu' })).toBeInTheDocument();
  });

  it('⛔ lỗi KHÔNG làm lọt mật khẩu ra console', async () => {
    patchResponder = () =>
      HttpResponse.json(errorBody('AUTH_002', 'Mật khẩu hiện tại không đúng'), { status: 401 });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logs = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const { dialog } = await openDialog(user);

    await fill(user, dialog, { current: CURRENT, next: NEXT, confirm: NEXT });
    await submit(user, dialog);
    await within(dialog).findByText('Mật khẩu hiện tại không đúng.');

    // Đã có ít nhất một dòng log (lỗi của FormModal) — nếu không thì bài này xanh vì không có gì để soi.
    expect(errors).toHaveBeenCalled();
    // In sâu mọi đối số (kể cả thuộc tính lồng nhau của AxiosError: config.data, headers) rồi tìm bí mật.
    const printed = [...errors.mock.calls, ...warns.mock.calls, ...logs.mock.calls]
      .map((args) => args.map((a) => flatten(a)).join(' '))
      .join('\n');
    expect(printed).not.toContain(CURRENT);
    expect(printed).not.toContain(NEXT);
    expect(printed).not.toContain('token-cu');
  });
});

describe('route /change-password — đích của link trong email "đăng nhập từ thiết bị mới"', { timeout: 30_000 }, () => {
  it('đã đăng nhập ⇒ mở sẵn hộp thoại đổi mật khẩu (không phải trang 404); đóng ⇒ về trang chủ', async () => {
    signIn(OPS_USER);
    const user = userEvent.setup();
    const { router } = renderApp(['/change-password']);

    const dialog = await screen.findByRole('dialog', { name: 'Đổi mật khẩu' });
    expect(router.state.location.pathname).toBe('/change-password');
    expect(screen.queryByText('Không tìm thấy trang')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Hủy bỏ' }));

    // Chỉ cần ĐÍCH điều hướng: không render trang chủ (nạp Recharts, chậm khi máy đang tải nặng).
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('⛔ chưa đăng nhập ⇒ qua /login rồi QUAY LẠI đúng hộp thoại đổi mật khẩu', async () => {
    resetAuth();
    server.use(
      http.get('*/auth/nonce', () =>
        HttpResponse.json({ success: true, data: { nonce: 'n', expiresIn: 120 } }),
      ),
      http.post('*/auth/login', () => HttpResponse.json(sessionBody(OPS_USER))),
    );
    const user = userEvent.setup();
    const { router } = renderApp(['/change-password']);

    await user.type(await screen.findByLabelText(/^Email/), 'an@congty.vn');
    await user.type(screen.getByLabelText(/^Mật khẩu/), 'mat-khau-dung');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('dialog', { name: 'Đổi mật khẩu' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/change-password');
  });
});
