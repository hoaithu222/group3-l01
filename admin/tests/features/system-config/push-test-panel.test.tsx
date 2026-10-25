/**
 * Công cụ "Gửi push thử" của tab `notifications` (p0-06 admin.md §2.2, §4) —
 * chỉ vai `admin` + `system-config:update` thấy panel, bắt buộc lý do ≥ 10 ký tự,
 * hiện kết quả FCM/VoIP, lỗi `PUSH_001/002` bằng tiếng Việt và KHÔNG có ô nhập nội dung.
 *
 * Mock ở tầng HTTP (MSW) để đi đúng đường thật (axios interceptor, React Query,
 * ô chọn người nhận tìm qua `GET /users?q=`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import PushTestPanel from '@/features/system-config/notifications/components/PushTestPanel';
import { useToastStore } from '@/shared/ui/overlays/toast-store';
import { matchesSearch } from '@/shared/utils/format/string.utils';

interface PushTestBody {
  userId: string;
  type: string;
  reason: string;
}

const USERS = [
  { id: 'u1', email: 'nguyen.van.an@congty.vn', name: 'Nguyễn Văn An' },
  { id: 'u2', email: 'tran.thi.binh@congty.vn', name: 'Trần Thị Bình' },
];

const OK_RESULT = { fcm: { sent: 2, failed: 0 }, voip: { sent: 1, failed: 0 } };
const VALID_REASON = 'Kiểm tra chuông cuộc gọi trước khi phát hành';

let pushTestBodies: PushTestBody[] = [];
let userQueries: URLSearchParams[] = [];

const server = setupServer(
  http.get('*/users', ({ request }) => {
    const params = new URL(request.url).searchParams;
    userQueries.push(params);
    const q = params.get('q');
    const rows = q ? USERS.filter((u) => matchesSearch([u.name, u.email], q)) : USERS;
    return HttpResponse.json({
      success: true,
      data: rows,
      meta: {
        page: 1,
        limit: 20,
        total: rows.length,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    });
  }),
  http.post('*/admin/push/test', async ({ request }) => {
    pushTestBodies.push((await request.json()) as PushTestBody);
    return HttpResponse.json({ success: true, message: 'Đã gửi push thử', data: OK_RESULT });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  pushTestBodies = [];
  userQueries = [];
  useToastStore.setState({ toasts: [] });
  useAuthStore.getState().clearAuth();
});

function signIn(roles: string[], permissions: string[]) {
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'admin@congty.vn', name: 'Quản Trị', roles, permissions },
    token: 'test-token',
  });
}

// `Form` (kit2) gọi `useBlocker` ⇒ cần data router, không chạy được dưới `MemoryRouter`.
function renderPanel() {
  const router = createMemoryRouter([{ path: '/', element: <PushTestPanel /> }]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const sendButton = () => screen.getByRole('button', { name: 'Gửi thử' });

describe('PushTestPanel — quyền', () => {
  it('manager có system-config:update nhưng không phải admin → KHÔNG thấy panel', () => {
    signIn(['manager'], ['system-config:view', 'system-config:update']);
    renderPanel();

    expect(screen.queryByText('Gửi push thử')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi thử' })).not.toBeInTheDocument();
  });

  it('người dùng chỉ có system-config:view → không thấy panel', () => {
    signIn(['manager'], ['system-config:view']);
    renderPanel();

    expect(screen.queryByText('Gửi push thử')).not.toBeInTheDocument();
  });

  it('admin → thấy panel và nút "Gửi thử"', () => {
    signIn(['admin'], []);
    renderPanel();

    expect(screen.getByText('Gửi push thử')).toBeInTheDocument();
    expect(sendButton()).toBeInTheDocument();
  });
});

describe('PushTestPanel — riêng tư', () => {
  it('KHÔNG có ô nhập nội dung tự do: chỉ một ô văn bản (lý do), nội dung cố định hiển thị dạng chữ', () => {
    signIn(['admin'], []);
    renderPanel();

    // Chỉ `Lý do` là ô nhập văn bản; người nhận/loại là ô chọn, không phải ô gõ nội dung.
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.queryByLabelText(/nội dung/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tiêu đề/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Đây là thông báo thử từ quản trị/)).toBeInTheDocument();
  });

  it('không có trường nội dung trong body gửi đi', async () => {
    signIn(['admin'], []);
    renderPanel();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Lý do/), VALID_REASON);
    await user.click(sendButton());

    await waitFor(() => expect(pushTestBodies).toHaveLength(1));
    expect(Object.keys(pushTestBodies[0]!).sort()).toEqual(['reason', 'type', 'userId']);
  });
});

describe('PushTestPanel — gửi', () => {
  beforeEach(() => signIn(['admin'], []));

  it('thiếu lý do → báo lỗi ở ô, KHÔNG gọi API', async () => {
    renderPanel();
    const user = userEvent.setup();

    await user.click(sendButton());

    expect(await screen.findByText('Lý do là bắt buộc')).toBeInTheDocument();
    expect(pushTestBodies).toHaveLength(0);
  });

  it('lý do < 10 ký tự → báo lỗi, KHÔNG gọi API', async () => {
    renderPanel();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Lý do/), 'ngắn quá');
    await user.click(sendButton());

    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(pushTestBodies).toHaveLength(0);
  });

  it('lý do toàn khoảng trắng không được coi là hợp lệ', async () => {
    renderPanel();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Lý do/), '               ');
    await user.click(sendButton());

    expect(await screen.findByText('Lý do là bắt buộc')).toBeInTheDocument();
    expect(pushTestBodies).toHaveLength(0);
  });

  it('gửi hợp lệ → mặc định gửi cho CHÍNH MÌNH, loại message.new, hiện kết quả FCM/VoIP', async () => {
    renderPanel();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Lý do/), VALID_REASON);
    await user.click(sendButton());

    expect(await screen.findByText('FCM: gửi 2 / lỗi 0 · VoIP: gửi 1 / lỗi 0')).toBeInTheDocument();
    expect(screen.getByText('Đã gửi push thử')).toBeInTheDocument();
    expect(pushTestBodies).toEqual([{ userId: 'me', type: 'message.new', reason: VALID_REASON }]);
    // Mỗi lần thử cần lý do riêng để audit ghi đúng — ô lý do được xoá sau khi gửi.
    await waitFor(() => expect(screen.getByLabelText(/Lý do/)).toHaveValue(''));
  });

  it('chọn người nhận khác qua ô tìm (q có gửi lên BE, chỉ tài khoản ACTIVE) → body mang id người đó', async () => {
    renderPanel();
    const user = userEvent.setup();

    // Mở ô chọn người nhận (nút có tên accessible là nhãn "Người nhận", hiển thị placeholder "Chính bạn · …").
    await user.click(screen.getByRole('button', { name: /Người nhận/ }));
    await user.type(await screen.findByPlaceholderText('Tìm kiếm...'), 'tran');

    // Tìm không dấu vẫn ra "Trần Thị Bình".
    const option = await screen.findByRole('button', { name: /Trần Thị Bình/ });
    expect(screen.queryByRole('button', { name: /Nguyễn Văn An/ })).not.toBeInTheDocument();
    const lastQuery = userQueries[userQueries.length - 1]!;
    expect(lastQuery.get('q')).toBe('tran');
    expect(lastQuery.get('status')).toBe('ACTIVE');

    await user.click(option);
    await user.type(screen.getByLabelText(/Lý do/), VALID_REASON);
    await user.click(sendButton());

    await waitFor(() => expect(pushTestBodies).toHaveLength(1));
    expect(pushTestBodies[0]!.userId).toBe('u2');
  });

  it('chọn loại "Cuộc gọi đến" → body gửi type call.incoming; đủ 3 loại theo enum BE', async () => {
    renderPanel();
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: /Loại thông báo/ }));
    expect(await screen.findByRole('option', { name: 'Tin nhắn mới' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Nhắc lịch họp' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Cuộc gọi đến' }));

    await user.type(screen.getByLabelText(/Lý do/), VALID_REASON);
    await user.click(sendButton());

    await waitFor(() => expect(pushTestBodies).toHaveLength(1));
    expect(pushTestBodies[0]!.type).toBe('call.incoming');
  });

  it('kết quả toàn lỗi → cảnh báo không gửi được tới thiết bị nào', async () => {
    server.use(
      http.post('*/admin/push/test', () =>
        HttpResponse.json({
          success: true,
          data: { fcm: { sent: 0, failed: 2 }, voip: { sent: 0, failed: 0 } },
        }),
      ),
    );
    renderPanel();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Lý do/), VALID_REASON);
    await user.click(sendButton());

    expect(await screen.findByText('FCM: gửi 0 / lỗi 2 · VoIP: gửi 0 / lỗi 0')).toBeInTheDocument();
    expect(screen.getByText('Không gửi được tới thiết bị nào')).toBeInTheDocument();
  });
});

describe('PushTestPanel — lỗi từ BE', () => {
  beforeEach(() => signIn(['admin'], []));

  it('PUSH_001 → thông điệp tiếng Việt ngay trong panel, không toast', async () => {
    server.use(
      http.post('*/admin/push/test', () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'PUSH_001', message: 'Push service is not configured' },
          },
          { status: 503 },
        ),
      ),
    );
    renderPanel();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Lý do/), VALID_REASON);
    await user.click(sendButton());

    // Câu tiếng Việt lấy từ bảng mã lỗi chung, KHÔNG phải câu tiếng Anh BE trả.
    expect(await screen.findByText('Dịch vụ thông báo đẩy chưa được cấu hình')).toBeInTheDocument();
    expect(screen.queryByText('Push service is not configured')).not.toBeInTheDocument();
    expect(useToastStore.getState().toasts).toHaveLength(0);
    // Lỗi thì giữ nguyên lý do đã gõ để thử lại sau khi sửa cấu hình.
    expect(screen.getByLabelText(/Lý do/)).toHaveValue(VALID_REASON);
  });

  it('PUSH_002 → "Người dùng chưa có thiết bị nhận thông báo", không toast', async () => {
    server.use(
      http.post('*/admin/push/test', () =>
        HttpResponse.json(
          { success: false, error: { code: 'PUSH_002', message: 'No device' } },
          { status: 404 },
        ),
      ),
    );
    renderPanel();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Lý do/), VALID_REASON);
    await user.click(sendButton());

    expect(
      await screen.findByText('Người dùng chưa có thiết bị nhận thông báo'),
    ).toBeInTheDocument();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('lỗi khác (403) → toast, không hiện callout mã PUSH', async () => {
    server.use(
      http.post('*/admin/push/test', () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'AUTH_005', message: 'Bạn không có quyền thực hiện hành động này' },
          },
          { status: 403 },
        ),
      ),
    );
    renderPanel();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Lý do/), VALID_REASON);
    await user.click(sendButton());

    await waitFor(() => expect(useToastStore.getState().toasts.length).toBeGreaterThan(0));
    expect(screen.queryByText('Dịch vụ thông báo đẩy chưa được cấu hình')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Người dùng chưa có thiết bị nhận thông báo'),
    ).not.toBeInTheDocument();
  });
});
