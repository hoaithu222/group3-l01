/**
 * Sub-tab "Job lỗi" (p0-04 §2.2 · §2.4):
 *  - manager (chỉ `system-config:view`) không thấy nút Chạy lại / Gỡ bỏ, kể cả trong drawer
 *  - retry/remove bắt buộc lý do ≥ 10 ký tự, gọi ĐÚNG endpoint + body, toast, làm mới danh sách
 *  - `JOB_001..003` (dữ liệu đã cũ) ⇒ thông điệp tiếng Việt của BE, modal đóng, danh sách làm mới
 *  - lọc queue + phân trang `start/limit` đồng bộ URL
 *
 * Mock ở tầng HTTP (MSW) — lỗi đi qua axios interceptor thật, nên thông điệp
 * tiếng Việt là của BE/`ERROR_CODE_MESSAGES`, không phải do test dựng.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/app/store';
import JobsTab from '@/features/system-config/jobs/JobsTab';
import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import {
  createJobsBackend,
  makeFailedJob,
  renderWithProviders,
  signIn,
  signInAdmin,
  signInManager,
} from './jobs-test-utils';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  useToastStore.setState({ toasts: [] });
});

const ROUTE = '/system-config?tab=jobs&sub=failed';
const MAIL_ID = 'mail.send:welcome:ab12';
const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);

const JOBS = [
  makeFailedJob(),
  makeFailedJob({
    queue: 'push',
    jobId: 'push-77',
    name: 'push.deliver',
    failedReason: 'FCM trả 503 Service Unavailable',
    attemptsMade: 3,
    timestamp: 1_000,
    finishedOn: 2_000,
  }),
  makeFailedJob({
    queue: 'calls',
    jobId: '42',
    name: 'call.ring-timeout',
    failedReason: 'Không kết nối được Redis',
    attemptsMade: 1,
    timestamp: 500,
    finishedOn: null,
  }),
];

/** Dòng bảng của job theo `jobId` (nút chép ID là nút có tên = jobId). */
const rowOf = async (jobId: string) =>
  within((await screen.findByRole('button', { name: jobId })).closest('tr') as HTMLElement);

/** Mở bảng "Job lỗi" của `backend` với vai hiện tại. */
async function openFailed(route = ROUTE) {
  const backend = createJobsBackend({ failed: JOBS.map((j) => ({ ...j })) });
  server.use(...backend.handlers);
  const view = renderWithProviders(<JobsTab />, route);
  await screen.findByRole('button', { name: MAIL_ID });
  return { ...backend, ...view };
}

describe('nút hành động theo quyền', () => {
  it('manager KHÔNG có system-config:update ⇒ thấy bảng nhưng không có nút Chạy lại/Gỡ bỏ', async () => {
    signInManager();
    await openFailed();

    expect(screen.getByText('SMTP timeout khi gửi thư chào')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chạy lại' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gỡ bỏ' })).not.toBeInTheDocument();
  });

  it('manager cũng không thấy nút trong drawer chi tiết', async () => {
    signInManager();
    const user = userEvent.setup();
    await openFailed();

    await user.click(screen.getByRole('button', { name: /SMTP timeout khi gửi thư chào/ }));

    const drawer = within(await screen.findByRole('dialog', { name: 'Job lỗi — mail.send' }));
    expect(drawer.getByText('Lý do lỗi')).toBeInTheDocument();
    expect(drawer.queryByRole('button', { name: 'Chạy lại' })).not.toBeInTheDocument();
    expect(drawer.queryByRole('button', { name: 'Gỡ bỏ' })).not.toBeInTheDocument();
  });

  it('quyền quyết định chứ không phải vai: manager CÓ system-config:update thì thấy nút', async () => {
    signIn('manager', ['system-config:view', 'system-config:update']);
    await openFailed();

    expect(screen.getAllByRole('button', { name: 'Chạy lại' })).toHaveLength(JOBS.length);
    expect(screen.getAllByRole('button', { name: 'Gỡ bỏ' })).toHaveLength(JOBS.length);
  });

  it('vai admin (vượt mọi kiểm quyền chi tiết) thấy nút ở mọi dòng', async () => {
    signInAdmin();
    await openFailed();

    expect(screen.getAllByRole('button', { name: 'Chạy lại' })).toHaveLength(JOBS.length);
  });
});

describe('Chạy lại (retry)', () => {
  beforeEach(signInAdmin);

  it('hộp thoại nêu tác động, lý do < 10 ký tự ⇒ lỗi ở field và KHÔNG gọi API', async () => {
    const user = userEvent.setup();
    const { state } = await openFailed();

    await user.click((await rowOf(MAIL_ID)).getByRole('button', { name: 'Chạy lại' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Chạy lại job — mail.send' }));
    expect(dialog.getByText('Job sẽ chạy lại với dữ liệu gốc.')).toBeInTheDocument();
    await user.type(dialog.getByLabelText(/Lý do/i), 'ngan qua');
    await user.click(dialog.getByRole('button', { name: 'Chạy lại' }));

    expect(await dialog.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(state.actions).toHaveLength(0);
    expect(toastTitles()).toEqual([]);
  });

  it('thành công ⇒ POST đúng endpoint (jobId chứa ":" được mã hoá) + body đã trim, toast, danh sách tải lại', async () => {
    const user = userEvent.setup();
    const { state, queryClient } = await openFailed();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click((await rowOf(MAIL_ID)).getByRole('button', { name: 'Chạy lại' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Chạy lại job — mail.send' }));
    await user.type(dialog.getByLabelText(/Lý do/i), '  Đã sửa cấu hình SMTP, chạy lại  ');
    await user.click(dialog.getByRole('button', { name: 'Chạy lại' }));

    await waitFor(() => expect(state.actions).toHaveLength(1));
    const call = state.actions[0];
    expect(call.path.endsWith('/admin/jobs/notifications/mail.send%3Awelcome%3Aab12/retry')).toBe(
      true,
    );
    expect(call.params).toMatchObject({ queue: 'notifications', jobId: MAIL_ID });
    expect(call.body).toEqual({ reason: 'Đã sửa cấu hình SMTP, chạy lại' });

    await waitFor(() => expect(toastTitles()).toContain('Đã chạy lại job và ghi nhật ký'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Invalidate đúng phần bị ảnh hưởng: job lỗi + số liệu queue + nhật ký.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['system-config', 'jobs', 'failed'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['system-config', 'jobs', 'queues'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit-log'] });
    // Danh sách tải lại thật: job vừa chạy lại không còn ở trạng thái lỗi.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: MAIL_ID })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'push-77' })).toBeInTheDocument();
    expect(state.failedQueries.length).toBeGreaterThanOrEqual(2);
  });

  it('JOB_002 (job đã không còn lỗi) ⇒ toast thông điệp BE, modal đóng, danh sách làm mới, KHÔNG báo thành công', async () => {
    const user = userEvent.setup();
    const { state } = await openFailed();
    server.use(
      http.post('*/admin/jobs/:queue/:jobId/retry', () =>
        HttpResponse.json(
          { success: false, error: { code: 'JOB_002', message: ERROR_CODE_MESSAGES.JOB_002 } },
          { status: 409 },
        ),
      ),
    );
    const before = state.failedQueries.length;

    await user.click((await rowOf(MAIL_ID)).getByRole('button', { name: 'Chạy lại' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Chạy lại job — mail.send' }));
    await user.type(dialog.getByLabelText(/Lý do/i), 'Chạy lại theo yêu cầu vận hành');
    await user.click(dialog.getByRole('button', { name: 'Chạy lại' }));

    await waitFor(() => expect(toastTitles()).toContain(ERROR_CODE_MESSAGES.JOB_002));
    expect(ERROR_CODE_MESSAGES.JOB_002).toContain('không thể chạy lại');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(state.failedQueries.length).toBeGreaterThan(before));
    expect(toastTitles()).not.toContain('Đã chạy lại job và ghi nhật ký');
    expect(toastTitles().join(' ')).not.toMatch(/JOB_002|status code|Request failed/);
  });

  it('lỗi khác (500) ⇒ modal GIỮ MỞ để thử lại, danh sách không bị làm mới oan', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const { state } = await openFailed();
    server.use(
      http.post('*/admin/jobs/:queue/:jobId/retry', () =>
        HttpResponse.json(
          { success: false, error: { code: 'SYS_500', message: 'Lỗi hệ thống' } },
          { status: 500 },
        ),
      ),
    );
    const before = state.failedQueries.length;

    await user.click((await rowOf(MAIL_ID)).getByRole('button', { name: 'Chạy lại' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Chạy lại job — mail.send' }));
    await user.type(dialog.getByLabelText(/Lý do/i), 'Chạy lại theo yêu cầu vận hành');
    await user.click(dialog.getByRole('button', { name: 'Chạy lại' }));

    await waitFor(() => expect(toastTitles().length).toBeGreaterThan(0));
    expect(screen.getByRole('dialog', { name: 'Chạy lại job — mail.send' })).toBeInTheDocument();
    expect(state.failedQueries.length).toBe(before);
  });
});

describe('Gỡ bỏ (remove)', () => {
  beforeEach(signInAdmin);

  it('cảnh báo không khôi phục; thành công ⇒ POST /remove với lý do, job biến khỏi danh sách', async () => {
    const user = userEvent.setup();
    const { state } = await openFailed();

    await user.click((await rowOf('push-77')).getByRole('button', { name: 'Gỡ bỏ' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Gỡ job lỗi — push.deliver' }));
    expect(
      dialog.getByText('Job bị gỡ hẳn khỏi hàng đợi và không thể khôi phục.'),
    ).toBeInTheDocument();
    await user.type(dialog.getByLabelText(/Lý do/i), 'Job rác từ đợt thử nghiệm');
    await user.click(dialog.getByRole('button', { name: 'Gỡ bỏ' }));

    await waitFor(() => expect(state.actions).toHaveLength(1));
    expect(state.actions[0].path.endsWith('/admin/jobs/push/push-77/remove')).toBe(true);
    expect(state.actions[0].body).toEqual({ reason: 'Job rác từ đợt thử nghiệm' });
    await waitFor(() => expect(toastTitles()).toContain('Đã gỡ job và ghi nhật ký'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'push-77' })).not.toBeInTheDocument(),
    );
  });

  it('JOB_001 (job đã bị người khác gỡ) ⇒ toast thông điệp BE, modal đóng, dòng cũ biến mất', async () => {
    const user = userEvent.setup();
    const { state } = await openFailed();

    await user.click((await rowOf('push-77')).getByRole('button', { name: 'Gỡ bỏ' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Gỡ job lỗi — push.deliver' }));
    // Người khác gỡ mất job trong lúc hộp thoại đang mở.
    state.failed = state.failed.filter((j) => j.jobId !== 'push-77');
    await user.type(dialog.getByLabelText(/Lý do/i), 'Job rác từ đợt thử nghiệm');
    await user.click(dialog.getByRole('button', { name: 'Gỡ bỏ' }));

    await waitFor(() => expect(toastTitles()).toContain(ERROR_CODE_MESSAGES.JOB_001));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'push-77' })).not.toBeInTheDocument(),
    );
    expect(toastTitles()).not.toContain('Đã gỡ job và ghi nhật ký');
  });
});

describe('drawer chi tiết', () => {
  beforeEach(signInAdmin);

  it('hiện lỗi đầy đủ + payload; "Chạy lại" ở footer mở hộp xác nhận, xong thì đóng cả hai', async () => {
    const user = userEvent.setup();
    const { state } = await openFailed();

    await user.click(screen.getByRole('button', { name: /SMTP timeout khi gửi thư chào/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Job lỗi — mail.send' });
    expect(within(drawer).getByText('Hàng đợi').nextElementSibling).toHaveTextContent(
      'notifications',
    );
    expect(within(drawer).getByText('Số lần thử').nextElementSibling).toHaveTextContent('5');
    expect(within(drawer).getByText('Dữ liệu job (đã che thông tin nhạy cảm)')).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: 'Chạy lại' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Chạy lại job — mail.send' }));
    await user.type(dialog.getByLabelText(/Lý do/i), 'Chạy lại từ ngăn chi tiết');
    await user.click(dialog.getByRole('button', { name: 'Chạy lại' }));

    await waitFor(() => expect(state.actions).toHaveLength(1));
    expect(state.actions[0].params).toMatchObject({ queue: 'notifications', jobId: MAIL_ID });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('job không có finishedOn ⇒ cột thời gian rơi về thời điểm tạo, drawer hiện "—" cho "Lỗi lúc"', async () => {
    const user = userEvent.setup();
    await openFailed();

    await user.click(screen.getByRole('button', { name: /Không kết nối được Redis/ }));

    const drawer = within(
      await screen.findByRole('dialog', { name: 'Job lỗi — call.ring-timeout' }),
    );
    expect(drawer.getByText('Lỗi lúc').nextElementSibling).toHaveTextContent('—');
  });
});

describe('lọc queue + phân trang start/limit đồng bộ URL', () => {
  beforeEach(signInManager);

  it('mở thẳng ?queue=push ⇒ request có queue=push, bảng chỉ có job push', async () => {
    const backend = createJobsBackend({ failed: JOBS.map((j) => ({ ...j })) });
    server.use(...backend.handlers);
    renderWithProviders(<JobsTab />, `${ROUTE}&queue=push`);

    expect(await screen.findByRole('button', { name: 'push-77' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MAIL_ID })).not.toBeInTheDocument();
    const q = backend.state.failedQueries.at(-1);
    expect(q?.get('queue')).toBe('push');
    expect(q?.get('start')).toBe('0');
    expect(q?.get('limit')).toBe('24');
  });

  it('chọn queue ở dropdown ⇒ ghi ?queue= lên URL và lọc; chọn "Mọi hàng đợi" ⇒ xoá khỏi URL', async () => {
    const user = userEvent.setup();
    const { state } = await openFailed();

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'push' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('queue=push'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: MAIL_ID })).not.toBeInTheDocument(),
    );
    expect(state.failedQueries.at(-1)?.get('queue')).toBe('push');

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Mọi hàng đợi' }));
    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('queue='));
    expect(await screen.findByRole('button', { name: MAIL_ID })).toBeInTheDocument();
  });

  it('?page=2&pageSize=2 ⇒ start=2, limit=2, hiện job thứ 3; "Trang trước" quay về start=0', async () => {
    const user = userEvent.setup();
    const backend = createJobsBackend({ failed: JOBS.map((j) => ({ ...j })) });
    server.use(...backend.handlers);
    renderWithProviders(<JobsTab />, `${ROUTE}&page=2&pageSize=2`);

    expect(await screen.findByRole('button', { name: '42' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MAIL_ID })).not.toBeInTheDocument();
    const q = backend.state.failedQueries.at(-1);
    expect(q?.get('start')).toBe('2');
    expect(q?.get('limit')).toBe('2');

    await user.click(screen.getByRole('button', { name: 'Trang trước' }));

    expect(await screen.findByRole('button', { name: MAIL_ID })).toBeInTheDocument();
    expect(backend.state.failedQueries.at(-1)?.get('start')).toBe('0');
    expect(screen.getByTestId('location')).toHaveTextContent('page=1');
  });

  it('đổi bộ lọc queue tự đưa trang về 1', async () => {
    const user = userEvent.setup();
    const backend = createJobsBackend({ failed: JOBS.map((j) => ({ ...j })) });
    server.use(...backend.handlers);
    renderWithProviders(<JobsTab />, `${ROUTE}&page=2&pageSize=2`);
    await screen.findByRole('button', { name: '42' });

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'notifications' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('page=1'));
    expect(await screen.findByRole('button', { name: MAIL_ID })).toBeInTheDocument();
  });

  it('gỡ job cuối của trang cuối ⇒ tự lùi về trang cuối còn dữ liệu, không kẹt ở trang rỗng', async () => {
    signInAdmin();
    const user = userEvent.setup();
    const backend = createJobsBackend({ failed: JOBS.map((j) => ({ ...j })) });
    server.use(...backend.handlers);
    renderWithProviders(<JobsTab />, `${ROUTE}&page=2&pageSize=2`);

    await user.click((await rowOf('42')).getByRole('button', { name: 'Gỡ bỏ' }));
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Gỡ job lỗi — call.ring-timeout' }),
    );
    await user.type(dialog.getByLabelText(/Lý do/i), 'Job rác từ đợt thử nghiệm');
    await user.click(dialog.getByRole('button', { name: 'Gỡ bỏ' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('page=1'));
    expect(await screen.findByRole('button', { name: MAIL_ID })).toBeInTheDocument();
  });

  it('gộp mọi hàng đợi + nhiều trang ⇒ nhắc phân trang chỉ gần đúng; chọn 1 queue thì không nhắc', async () => {
    const backend = createJobsBackend({ failed: JOBS.map((j) => ({ ...j })) });
    server.use(...backend.handlers);
    const view = renderWithProviders(<JobsTab />, `${ROUTE}&pageSize=2`);

    const hint = /Đang gộp mọi hàng đợi — phân trang chỉ gần đúng/;
    expect(await screen.findByText(hint)).toBeInTheDocument();
    view.unmount();

    renderWithProviders(<JobsTab />, `${ROUTE}&pageSize=2&queue=notifications`);
    await screen.findByRole('button', { name: MAIL_ID });
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });

  it('?queue= lạ (gõ tay) ⇒ coi như không lọc, KHÔNG gửi giá trị BE sẽ từ chối', async () => {
    const backend = createJobsBackend({ failed: JOBS.map((j) => ({ ...j })) });
    server.use(...backend.handlers);
    renderWithProviders(<JobsTab />, `${ROUTE}&queue=khong-co`);

    expect(await screen.findByRole('button', { name: MAIL_ID })).toBeInTheDocument();
    expect(backend.state.failedQueries.at(-1)?.has('queue')).toBe(false);
  });
});
