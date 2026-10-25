/**
 * Sub-tab "Outbox" (p0-04 §2.3 · §2.4):
 *  - mặc định lọc `FAILED` (URL không cần ghi), "Mọi trạng thái" = `status=all` và bỏ tham số
 *  - lọc loại, badge trạng thái bằng `statusBadge('outbox', …)`
 *  - phân trang cursor: "Tải thêm" nối tiếp bằng `cursor` của BE, hết trang thì mất nút
 *  - "Đưa lại hàng đợi" chỉ cho bản ghi FAILED + chỉ khi có `system-config:update`,
 *    bắt buộc lý do, gọi đúng endpoint, `JOB_003` xử lý như dữ liệu cũ
 *
 * Mock ở tầng HTTP (MSW) — không mock service/queries.
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
import { statusBadge } from '@/shared/utils/format';

import {
  createJobsBackend,
  makeOutbox,
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

const ROUTE = '/system-config?tab=jobs&sub=outbox';
const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);
const idOf = (n: number) => `65f0c1a2b3c4d5e6f7a8b9${String(n).padStart(2, '0')}`;

/** 5 bản ghi FAILED (3 trang với OUTBOX_PAGE = 2) + 1 PENDING + 1 DISPATCHED. */
function fixtures() {
  return [
    ...[1, 2, 3, 4, 5].map((n) =>
      makeOutbox({
        id: idOf(n),
        type: n === 2 ? 'user.session-invalidated' : 'call.ring-timeout.schedule',
        aggregateId: idOf(n + 50),
        lastError: n === 2 ? null : `Redis ECONNREFUSED #${n}`,
      }),
    ),
    makeOutbox({ id: idOf(6), status: 'PENDING', attempts: 1, lastError: null }),
    makeOutbox({ id: idOf(7), status: 'DISPATCHED', attempts: 1, lastError: null }),
  ];
}

/** `pageSize` lớn ⇒ mọi bản ghi nằm trong 1 trang (mặc định 2 để kiểm "Tải thêm"). */
async function openOutbox(route = ROUTE, outboxPageSize?: number) {
  const backend = createJobsBackend({ outbox: fixtures(), outboxPageSize });
  server.use(...backend.handlers);
  const view = renderWithProviders(<JobsTab />, route);
  await screen.findByText('Redis ECONNREFUSED #1');
  return { ...backend, ...view };
}

const rowOfId = (n: number) =>
  within(screen.getByTitle(`Call#${idOf(n + 50)}`).closest('tr') as HTMLElement);
const dataRows = () => screen.getAllByRole('row').slice(1);

describe('lọc trạng thái mặc định FAILED', () => {
  beforeEach(signInManager);

  it('mở tab ⇒ gọi API với status=FAILED, URL sạch, chỉ hiện bản ghi FAILED', async () => {
    const { state } = await openOutbox();

    expect(state.outboxQueries[0].get('status')).toBe('FAILED');
    expect(screen.getByTestId('location')).not.toHaveTextContent('status=');
    expect(screen.getByRole('combobox')).toHaveTextContent('Thất bại');
    expect(dataRows()).toHaveLength(2);
    expect(screen.queryByText('Chờ gửi')).not.toBeInTheDocument();
    expect(screen.queryByText('Đã gửi')).not.toBeInTheDocument();
    // Đếm trong bảng — dropdown lọc cũng đang hiện chữ "Thất bại".
    expect(within(screen.getByRole('table')).getAllByText('Thất bại')).toHaveLength(2);
  });

  it('chọn "Mọi trạng thái" ⇒ ?status=all, bỏ tham số status, hiện đủ badge chữ theo statusBadge', async () => {
    const user = userEvent.setup();
    const { state } = await openOutbox(ROUTE, 10);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Mọi trạng thái' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('status=all'));
    await waitFor(() => expect(state.outboxQueries.at(-1)?.has('status')).toBe(false));
    expect(await screen.findByText('Chờ gửi')).toBeInTheDocument();
    expect(screen.getByText('Đã gửi')).toBeInTheDocument();
    expect(screen.getAllByText('Thất bại').length).toBeGreaterThan(0);
  });

  it('chọn "Chờ gửi" ⇒ ?status=PENDING và chỉ có bản ghi PENDING', async () => {
    const user = userEvent.setup();
    const { state } = await openOutbox();

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Chờ gửi' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('status=PENDING'));
    await waitFor(() => expect(state.outboxQueries.at(-1)?.get('status')).toBe('PENDING'));
    await waitFor(() => expect(dataRows()).toHaveLength(1));
    expect(screen.queryByText('Redis ECONNREFUSED #1')).not.toBeInTheDocument();
  });

  it('?status=PENDING mở thẳng rồi chọn "Thất bại" ⇒ URL không còn status', async () => {
    const user = userEvent.setup();
    const backend = createJobsBackend({ outbox: fixtures() });
    server.use(...backend.handlers);
    renderWithProviders(<JobsTab />, `${ROUTE}&status=PENDING`);
    await waitFor(() => expect(dataRows()).toHaveLength(1));

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Thất bại' }));

    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('status='));
    expect(await screen.findByText('Redis ECONNREFUSED #1')).toBeInTheDocument();
    expect(backend.state.outboxQueries.at(-1)?.get('status')).toBe('FAILED');
  });

  it('?status= lạ (gõ tay) ⇒ coi như "Mọi trạng thái", không gửi giá trị BE sẽ từ chối', async () => {
    const backend = createJobsBackend({ outbox: fixtures(), outboxPageSize: 10 });
    server.use(...backend.handlers);
    renderWithProviders(<JobsTab />, `${ROUTE}&status=khong-co`);

    expect(await screen.findByText('Chờ gửi')).toBeInTheDocument();
    expect(backend.state.outboxQueries.at(-1)?.has('status')).toBe(false);
  });
});

describe('lọc theo loại', () => {
  beforeEach(signInManager);

  it('gõ loại ⇒ ghi ?type= và gọi API với type (sau debounce), chỉ hiện bản ghi đúng loại', async () => {
    const user = userEvent.setup();
    const { state } = await openOutbox();

    await user.type(
      screen.getByPlaceholderText('Lọc theo loại (vd call.ring-timeout)'),
      'user.session-invalidated',
    );

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('type=user.session-invalidated'),
    );
    await waitFor(
      () => expect(state.outboxQueries.at(-1)?.get('type')).toBe('user.session-invalidated'),
      {
        timeout: 3000,
      },
    );
    await waitFor(() => expect(dataRows()).toHaveLength(1));
    // Đúng bản ghi #2 (aggregate …52), các bản ghi loại khác đã biến mất.
    expect(screen.getByTitle(`Call#${idOf(52)}`)).toBeInTheDocument();
    expect(screen.queryByText('Redis ECONNREFUSED #1')).not.toBeInTheDocument();
  });
});

describe('bảng dữ liệu', () => {
  beforeEach(signInManager);

  it('cột: loại, aggregate rút gọn (đầy đủ ở title), queue · job, số lần thử, lỗi cuối', async () => {
    await openOutbox();

    const row = rowOfId(1);
    expect(row.getByText('call.ring-timeout.schedule')).toBeInTheDocument();
    expect(row.getByText(`Call#${idOf(51).slice(0, 6)}…${idOf(51).slice(-4)}`)).toBeInTheDocument();
    expect(row.getByText('calls')).toBeInTheDocument();
    expect(row.getByText('call.ring-timeout')).toBeInTheDocument();
    expect(row.getByText('10')).toBeInTheDocument();
    expect(row.getByText('Redis ECONNREFUSED #1')).toBeInTheDocument();
    // Bản ghi không có lỗi cuối hiện "—", không để ô trống.
    expect(rowOfId(2).getByText('—')).toBeInTheDocument();
  });

  it('không có bản ghi nào khớp ⇒ thông báo rỗng', async () => {
    const backend = createJobsBackend({ outbox: [] });
    server.use(...backend.handlers);
    renderWithProviders(<JobsTab />, ROUTE);

    expect(await screen.findByText('Không có sự kiện outbox nào khớp bộ lọc')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
  });
});

describe('phân trang cursor "Tải thêm"', () => {
  beforeEach(signInManager);

  it('nối tiếp bằng cursor của BE cho tới khi hết, rồi nút biến mất', async () => {
    const user = userEvent.setup();
    const { state } = await openOutbox();
    expect(dataRows()).toHaveLength(2);
    expect(state.outboxQueries[0].has('cursor')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => expect(dataRows()).toHaveLength(4));
    expect(state.outboxQueries.at(-1)?.get('cursor')).toBe('2');
    // Vẫn giữ nguyên bộ lọc khi tải thêm.
    expect(state.outboxQueries.at(-1)?.get('status')).toBe('FAILED');

    await user.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => expect(dataRows()).toHaveLength(5));
    expect(state.outboxQueries.at(-1)?.get('cursor')).toBe('4');
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
  });

  it('đổi bộ lọc ⇒ quay về trang đầu (không gửi cursor cũ)', async () => {
    const user = userEvent.setup();
    const { state } = await openOutbox();
    await user.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => expect(dataRows()).toHaveLength(4));

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Đã gửi' }));

    await waitFor(() => expect(state.outboxQueries.at(-1)?.get('status')).toBe('DISPATCHED'));
    expect(state.outboxQueries.at(-1)?.has('cursor')).toBe(false);
  });
});

describe('nút "Đưa lại hàng đợi" theo quyền + trạng thái', () => {
  it('manager KHÔNG có system-config:update ⇒ không có nút', async () => {
    signInManager();
    await openOutbox();

    expect(screen.queryByRole('button', { name: 'Đưa lại hàng đợi' })).not.toBeInTheDocument();
  });

  it('có quyền ⇒ nút ở mọi bản ghi FAILED', async () => {
    signIn('manager', ['system-config:view', 'system-config:update']);
    await openOutbox();

    expect(screen.getAllByRole('button', { name: 'Đưa lại hàng đợi' })).toHaveLength(2);
  });

  it('bản ghi không FAILED (PENDING/DISPATCHED) KHÔNG có nút dù có quyền', async () => {
    signInAdmin();
    const user = userEvent.setup();
    await openOutbox(ROUTE, 10);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Mọi trạng thái' }));
    await screen.findByText('Chờ gửi');

    const failedRows = within(screen.getByRole('table')).getAllByText('Thất bại').length;
    expect(failedRows).toBe(5);
    expect(screen.getAllByRole('button', { name: 'Đưa lại hàng đợi' })).toHaveLength(failedRows);
    const pending = screen.getByText('Chờ gửi').closest('tr') as HTMLElement;
    expect(
      within(pending).queryByRole('button', { name: 'Đưa lại hàng đợi' }),
    ).not.toBeInTheDocument();
  });
});

describe('Đưa lại hàng đợi (requeue)', () => {
  beforeEach(signInAdmin);
  const TITLE = 'Đưa sự kiện outbox về hàng đợi';

  it('nêu tác động; lý do < 10 ký tự ⇒ lỗi ở field và KHÔNG gọi API', async () => {
    const user = userEvent.setup();
    const { state } = await openOutbox();

    await user.click(rowOfId(1).getByRole('button', { name: 'Đưa lại hàng đợi' }));
    const dialog = within(await screen.findByRole('dialog', { name: TITLE }));
    expect(dialog.getByText(/Sự kiện được đặt lại về “Chờ gửi”/)).toBeInTheDocument();
    await user.type(dialog.getByLabelText(/Lý do/i), 'ngan qua');
    await user.click(dialog.getByRole('button', { name: 'Đưa lại hàng đợi' }));

    expect(await dialog.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(state.actions).toHaveLength(0);
  });

  it('thành công ⇒ POST đúng endpoint + body đã trim, toast, invalidate, bản ghi rời khỏi bộ lọc FAILED', async () => {
    const user = userEvent.setup();
    const { state, queryClient } = await openOutbox();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(rowOfId(1).getByRole('button', { name: 'Đưa lại hàng đợi' }));
    const dialog = within(await screen.findByRole('dialog', { name: TITLE }));
    await user.type(dialog.getByLabelText(/Lý do/i), '  Redis đã hồi phục, gửi lại  ');
    await user.click(dialog.getByRole('button', { name: 'Đưa lại hàng đợi' }));

    await waitFor(() => expect(state.actions).toHaveLength(1));
    expect(state.actions[0].path.endsWith(`/admin/jobs/outbox/${idOf(1)}/requeue`)).toBe(true);
    expect(state.actions[0].body).toEqual({ reason: 'Redis đã hồi phục, gửi lại' });
    await waitFor(() =>
      expect(toastTitles()).toContain('Đã đưa sự kiện về hàng đợi và ghi nhật ký'),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['system-config', 'jobs', 'outbox'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit-log'] });
    // Danh sách tải lại thật: bản ghi giờ PENDING nên không còn trong bộ lọc FAILED.
    await waitFor(() =>
      expect(screen.queryByText('Redis ECONNREFUSED #1')).not.toBeInTheDocument(),
    );
  });

  it('JOB_003 (đã có người đưa lại) ⇒ toast thông điệp BE, modal đóng, danh sách làm mới, KHÔNG báo thành công', async () => {
    const user = userEvent.setup();
    const { state } = await openOutbox();
    await user.click(rowOfId(1).getByRole('button', { name: 'Đưa lại hàng đợi' }));
    const dialog = within(await screen.findByRole('dialog', { name: TITLE }));
    // Người khác đưa lại trước trong lúc hộp thoại đang mở ⇒ BE trả JOB_003.
    state.outbox.find((e) => e.id === idOf(1))!.status = 'PENDING';
    const before = state.outboxQueries.length;
    await user.type(dialog.getByLabelText(/Lý do/i), 'Redis đã hồi phục, gửi lại');
    await user.click(dialog.getByRole('button', { name: 'Đưa lại hàng đợi' }));

    await waitFor(() => expect(toastTitles()).toContain(ERROR_CODE_MESSAGES.JOB_003));
    expect(ERROR_CODE_MESSAGES.JOB_003).toContain('không ở trạng thái thất bại');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(state.outboxQueries.length).toBeGreaterThan(before));
    await waitFor(() =>
      expect(screen.queryByText('Redis ECONNREFUSED #1')).not.toBeInTheDocument(),
    );
    expect(toastTitles()).not.toContain('Đã đưa sự kiện về hàng đợi và ghi nhật ký');
  });

  it('lỗi khác (500) ⇒ modal GIỮ MỞ để thử lại', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    await openOutbox();
    server.use(
      http.post('*/admin/jobs/outbox/:id/requeue', () =>
        HttpResponse.json(
          { success: false, error: { code: 'SYS_500', message: 'Lỗi hệ thống' } },
          { status: 500 },
        ),
      ),
    );

    await user.click(rowOfId(1).getByRole('button', { name: 'Đưa lại hàng đợi' }));
    const dialog = within(await screen.findByRole('dialog', { name: TITLE }));
    await user.type(dialog.getByLabelText(/Lý do/i), 'Redis đã hồi phục, gửi lại');
    await user.click(dialog.getByRole('button', { name: 'Đưa lại hàng đợi' }));

    await waitFor(() => expect(toastTitles().length).toBeGreaterThan(0));
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
  });
});

describe('statusBadge("outbox", …)', () => {
  it('mỗi trạng thái có nhãn tiếng Việt + tông riêng; giá trị lạ giữ nguyên chữ, tông trung tính', () => {
    expect(statusBadge('outbox', 'PENDING')).toEqual({ variant: 'warning', label: 'Chờ gửi' });
    expect(statusBadge('outbox', 'DISPATCHING')).toEqual({ variant: 'info', label: 'Đang gửi' });
    expect(statusBadge('outbox', 'DISPATCHED')).toEqual({ variant: 'success', label: 'Đã gửi' });
    expect(statusBadge('outbox', 'FAILED')).toEqual({ variant: 'error', label: 'Thất bại' });
    expect(statusBadge('outbox', 'MOI')).toEqual({ variant: 'neutral', label: 'MOI' });
  });
});
