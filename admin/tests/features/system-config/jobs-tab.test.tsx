/**
 * Tab `jobs` (p0-04) — sub-tab "Hàng đợi":
 *  - KPI mỗi queue theo dữ liệu BE; queue có lỗi hiện Badge CHỮ "Có lỗi" (không chỉ màu)
 *  - bảng "Lịch chạy định kỳ", nút "Làm mới", tự làm mới 15 s
 *  - sub-tab đồng bộ URL (`?sub=`), giá trị lạ rơi về "Hàng đợi"
 *
 * Mock ở tầng HTTP (MSW) — KHÔNG mock service/queries — để đi đúng đường thật
 * (axios interceptor, `useQueryParams`, React Query).
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/app/store';
import JobsTab from '@/features/system-config/jobs/JobsTab';
import { jobsKeys, QUEUES_REFETCH_MS } from '@/features/system-config/jobs/service/jobs.queries';
import { formatEpoch } from '@/features/system-config/jobs/utils/jobs-format';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import {
  createJobsBackend,
  makeFailedJob,
  makeQueue,
  NOW,
  renderWithProviders,
  signInManager,
} from './jobs-test-utils';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.useRealTimers();
});
afterAll(() => server.close());

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  useToastStore.setState({ toasts: [] });
  signInManager();
});

const QUEUES = [
  makeQueue('notifications', { waiting: 3, active: 1, delayed: 2, failed: 0 }),
  makeQueue('push', { waiting: 7, active: 4, delayed: 5, failed: 4, paused: true }),
  makeQueue('cron', {
    schedulers: [
      { id: 'assets.cleanup', pattern: '0 * * * *', next: NOW },
      { id: 'outbox.relay', pattern: null, next: NOW + 10_000 },
    ],
  }),
];

/** Vùng KPI của 1 queue — chờ dữ liệu về rồi mới có. */
const card = async (queue: string) =>
  within(await screen.findByRole('region', { name: `Hàng đợi ${queue}` }));

describe('sub-tab "Hàng đợi" — KPI', () => {
  it('render 4 KPI theo số liệu BE, đúng cặp nhãn ↔ số', async () => {
    const { handlers } = createJobsBackend({ queues: QUEUES });
    server.use(...handlers);
    renderWithProviders(<JobsTab />);

    const notifications = await card('notifications');
    expect(notifications.getByText('Đang chờ').parentElement).toHaveTextContent(/Đang chờ\s*3/);
    expect(notifications.getByText('Đang chạy').parentElement).toHaveTextContent(/Đang chạy\s*1/);
    expect(notifications.getByText('Hẹn giờ').parentElement).toHaveTextContent(/Hẹn giờ\s*2/);
    expect(notifications.getByText('Lỗi').parentElement).toHaveTextContent(/Lỗi\s*0/);

    const push = await card('push');
    expect(push.getByText('Đang chờ').parentElement).toHaveTextContent(/Đang chờ\s*7/);
    expect(push.getByText('Lỗi').parentElement).toHaveTextContent(/Lỗi\s*4/);
  });

  it('queue có lỗi > 0 hiện Badge chữ "Có lỗi"; queue không lỗi thì không', async () => {
    const { handlers } = createJobsBackend({ queues: QUEUES });
    server.use(...handlers);
    renderWithProviders(<JobsTab />);

    expect((await card('push')).getByText('Có lỗi')).toBeInTheDocument();
    expect((await card('notifications')).queryByText('Có lỗi')).not.toBeInTheDocument();
    expect((await card('cron')).queryByText('Có lỗi')).not.toBeInTheDocument();
    // Đúng MỘT badge trên cả màn — 1 queue có lỗi.
    expect(screen.getAllByText('Có lỗi')).toHaveLength(1);
  });

  it('queue đang tạm dừng có nhãn chữ "Đang tạm dừng"', async () => {
    const { handlers } = createJobsBackend({ queues: QUEUES });
    server.use(...handlers);
    renderWithProviders(<JobsTab />);

    expect((await card('push')).getByText('Đang tạm dừng')).toBeInTheDocument();
    expect((await card('notifications')).queryByText('Đang tạm dừng')).not.toBeInTheDocument();
  });
});

describe('sub-tab "Hàng đợi" — lịch chạy định kỳ', () => {
  it('liệt kê scheduler của mọi queue, sắp theo lần chạy tới, giờ theo máy', async () => {
    const { handlers } = createJobsBackend({ queues: QUEUES });
    server.use(...handlers);
    renderWithProviders(<JobsTab />);

    expect(await screen.findByText('assets.cleanup')).toBeInTheDocument();
    expect(screen.getByText('0 * * * *')).toBeInTheDocument();
    // Scheduler kiểu `every` không có pattern (BE chỉ trả `pattern`).
    expect(screen.getByText('outbox.relay')).toBeInTheDocument();
    expect(screen.getByText('Chu kỳ cố định')).toBeInTheDocument();
    expect(screen.getByText(formatEpoch(NOW))).toBeInTheDocument();
    expect(screen.getByText(formatEpoch(NOW + 10_000))).toBeInTheDocument();

    const ids = screen.getAllByText(/^(assets\.cleanup|outbox\.relay)$/).map((n) => n.textContent);
    expect(ids).toEqual(['assets.cleanup', 'outbox.relay']);
  });

  it('không có scheduler nào ⇒ thông báo rỗng', async () => {
    const { handlers } = createJobsBackend({ queues: [makeQueue('notifications')] });
    server.use(...handlers);
    renderWithProviders(<JobsTab />);

    expect(await screen.findByText('Chưa có lịch chạy định kỳ nào')).toBeInTheDocument();
  });
});

describe('sub-tab "Hàng đợi" — làm mới', () => {
  it('nút "Làm mới" gọi lại API', async () => {
    const { handlers, state } = createJobsBackend({ queues: QUEUES });
    server.use(...handlers);
    const user = userEvent.setup();
    renderWithProviders(<JobsTab />);
    await screen.findByRole('region', { name: 'Hàng đợi push' });
    expect(state.queuesCalls).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Làm mới' }));

    await waitFor(() => expect(state.queuesCalls).toBe(2));
  });

  it('tự làm mới sau đúng 15 s (refetchInterval) và số liệu mới hiện lên', async () => {
    expect(QUEUES_REFETCH_MS).toBe(15_000);
    const { handlers, state } = createJobsBackend({ queues: [makeQueue('push', { failed: 0 })] });
    server.use(...handlers);
    // Đồng hồ giả PHẢI bật trước lúc render: `setInterval` của React Query được đặt khi
    // observer mount. `shouldAdvanceTime` để `findBy*/waitFor` (dùng timer thật) vẫn chạy.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { queryClient } = renderWithProviders(<JobsTab />);
    expect((await card('push')).queryByText('Có lỗi')).not.toBeInTheDocument();
    expect(state.queuesCalls).toBe(1);

    // Cấu hình thật của observer.
    const observer = queryClient.getQueryCache().find({ queryKey: jobsKeys.queues })?.observers[0];
    expect(observer?.options.refetchInterval).toBe(QUEUES_REFETCH_MS);

    // Hành vi thật: chưa tới 15 s ⇒ chưa gọi lại; tới mốc ⇒ request thứ hai, số liệu đổi.
    state.queues = [makeQueue('push', { failed: 9 })];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUEUES_REFETCH_MS - 1_000);
    });
    expect(state.queuesCalls).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    await waitFor(() => expect(state.queuesCalls).toBe(2));
    expect(
      await within(await screen.findByRole('region', { name: 'Hàng đợi push' })).findByText(
        'Có lỗi',
      ),
    ).toBeInTheDocument();
  });
});

describe('sub-tab "Hàng đợi" — lỗi tải', () => {
  it('BE lỗi ⇒ Callout + nút "Thử lại", bấm thì tải lại được', async () => {
    let fail = true;
    const { handlers } = createJobsBackend({ queues: QUEUES });
    server.use(
      http.get('*/admin/jobs/queues', () =>
        fail
          ? HttpResponse.json(
              { success: false, error: { code: 'SYS_500', message: 'Lỗi máy chủ' } },
              { status: 500 },
            )
          : HttpResponse.json({ success: true, data: QUEUES }),
      ),
      ...handlers.slice(1),
    );
    const user = userEvent.setup();
    renderWithProviders(<JobsTab />);

    expect(await screen.findByText('Không tải được số liệu hàng đợi')).toBeInTheDocument();

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('region', { name: 'Hàng đợi push' })).toBeInTheDocument();
  });
});

describe('sub-tab đồng bộ URL', () => {
  it('mặc định là "Hàng đợi"; chọn "Job lỗi" ghi ?sub=failed và hiện bảng job lỗi', async () => {
    const { handlers } = createJobsBackend({ queues: QUEUES, failed: [makeFailedJob()] });
    server.use(...handlers);
    const user = userEvent.setup();
    renderWithProviders(<JobsTab />);
    await screen.findByRole('region', { name: 'Hàng đợi push' });
    expect(screen.getByTestId('location')).toHaveTextContent('/system-config?tab=jobs');
    expect(screen.getByRole('tab', { name: 'Hàng đợi' })).toHaveAttribute('data-state', 'active');

    await user.click(screen.getByRole('tab', { name: 'Job lỗi' }));

    expect(await screen.findByText('SMTP timeout khi gửi thư chào')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('sub=failed');
    // Giữ `tab=jobs` của trang cha.
    expect(screen.getByTestId('location')).toHaveTextContent('tab=jobs');
    expect(screen.queryByRole('region', { name: 'Hàng đợi push' })).not.toBeInTheDocument();
  });

  it('mở thẳng ?sub=outbox ⇒ hiện sub-tab Outbox đang chọn', async () => {
    const { handlers } = createJobsBackend({ queues: QUEUES });
    server.use(...handlers);
    renderWithProviders(<JobsTab />, '/system-config?tab=jobs&sub=outbox');

    expect(await screen.findByText('Không có sự kiện outbox nào khớp bộ lọc')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Outbox' })).toHaveAttribute('data-state', 'active');
  });

  it('?sub= lạ ⇒ rơi về "Hàng đợi"', async () => {
    const { handlers } = createJobsBackend({ queues: QUEUES });
    server.use(...handlers);
    renderWithProviders(<JobsTab />, '/system-config?tab=jobs&sub=khong-co');

    expect(await screen.findByRole('region', { name: 'Hàng đợi push' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Hàng đợi' })).toHaveAttribute('data-state', 'active');
  });

  it('đổi sub-tab xoá bộ lọc/phân trang của sub-tab cũ, giữ ?tab=', async () => {
    const { handlers } = createJobsBackend({ queues: QUEUES, failed: [makeFailedJob()] });
    server.use(...handlers);
    const user = userEvent.setup();
    renderWithProviders(
      <JobsTab />,
      '/system-config?tab=jobs&sub=failed&queue=push&page=3&pageSize=50',
    );
    await screen.findByRole('tab', { name: 'Job lỗi' });

    await user.click(screen.getByRole('tab', { name: 'Outbox' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('sub=outbox'));
    const loc = screen.getByTestId('location').textContent ?? '';
    expect(loc).toContain('tab=jobs');
    expect(loc).not.toMatch(/queue=|page=|pageSize=/);
  });
});
