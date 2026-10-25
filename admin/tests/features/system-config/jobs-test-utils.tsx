/**
 * Đồ dùng chung cho các bài kiểm tab `jobs` (p0-04): fixture theo ĐÚNG shape
 * `AdminJobsService` (`be/src/modules/admin-jobs/admin-jobs.service.ts`), "BE
 * giả" có trạng thái dựng bằng MSW (mock ở tầng HTTP — không mock service/
 * queries), và hàm đăng nhập/render.
 *
 * Shape lấy từ code BE, không phải từ plan: scheduler chỉ có `id/pattern/next`,
 * outbox trả `payloadPreview`, danh sách outbox là `{ data, meta:{nextCursor…} }`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type {
  FailedJob,
  OutboxEvent,
  OutboxStatus,
  QueueName,
  QueueSummary,
} from '@/features/system-config/jobs/types/jobs.types';

import JobsLocationProbe from './jobs-location-probe';

/** Số bản ghi outbox mỗi trang mặc định của BE giả — nhỏ để kiểm được "Tải thêm". */
export const OUTBOX_PAGE = 2;

export function makeQueue(name: QueueName, overrides: Partial<QueueSummary> = {}): QueueSummary {
  return {
    name,
    waiting: 0,
    active: 0,
    delayed: 0,
    failed: 0,
    completed: 0,
    paused: false,
    schedulers: [],
    ...overrides,
  };
}

export const NOW = Date.UTC(2026, 8, 19, 3, 30, 0);

export function makeFailedJob(overrides: Partial<FailedJob> = {}): FailedJob {
  return {
    queue: 'notifications',
    jobId: 'mail.send:welcome:ab12',
    name: 'mail.send',
    failedReason: 'SMTP timeout khi gửi thư chào',
    attemptsMade: 5,
    timestamp: NOW - 60_000,
    finishedOn: NOW,
    dataPreview: { template: 'welcome', email: '***', vars: { content: '***', token: '***' } },
    ...overrides,
  };
}

export function makeOutbox(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: '65f0c1a2b3c4d5e6f7a8b9c0',
    type: 'call.ring-timeout.schedule',
    aggregateType: 'Call',
    aggregateId: '65f0c1a2b3c4d5e6f7a8b9aa',
    queue: 'calls',
    jobName: 'call.ring-timeout',
    status: 'FAILED',
    attempts: 10,
    lastError: 'Redis ECONNREFUSED',
    availableAt: '2026-09-19T03:00:00.000Z',
    createdAt: '2026-09-19T03:00:00.000Z',
    dispatchedAt: null,
    payloadPreview: { callId: 'c1', token: '***' },
    ...overrides,
  };
}

export interface JobsBackendState {
  queues: QueueSummary[];
  failed: FailedJob[];
  outbox: OutboxEvent[];
  /** Số lần `GET /queues` đã gọi. */
  queuesCalls: number;
  /** Query string của từng lần `GET /failed`, theo thứ tự. */
  failedQueries: URLSearchParams[];
  /** Query string của từng lần `GET /outbox`, theo thứ tự. */
  outboxQueries: URLSearchParams[];
  /** Mỗi lần gọi retry/remove/requeue: đường dẫn THÔ (còn mã hoá %) + params đã giải mã + body. */
  actions: { path: string; params: Record<string, unknown>; body: unknown }[];
}

const notFound = () =>
  HttpResponse.json(
    { success: false, error: { code: 'JOB_001', message: 'Không tìm thấy job trong hàng đợi' } },
    { status: 404 },
  );

/**
 * "BE" giả có trạng thái: retry/remove thành công lấy job khỏi danh sách lỗi thật,
 * requeue đổi outbox sang PENDING thật — nên lần tải lại sau `invalidateQueries`
 * phản ánh đúng kết quả. Job/outbox không còn ⇒ đúng mã lỗi `JOB_001`/`JOB_003`.
 */
export function createJobsBackend(init: {
  queues?: QueueSummary[];
  failed?: FailedJob[];
  outbox?: OutboxEvent[];
  /** Số bản ghi outbox mỗi trang (mặc định `OUTBOX_PAGE`). */
  outboxPageSize?: number;
}) {
  const pageSize = init.outboxPageSize ?? OUTBOX_PAGE;
  const state: JobsBackendState = {
    queues: init.queues ?? [],
    failed: init.failed ?? [],
    outbox: init.outbox ?? [],
    queuesCalls: 0,
    failedQueries: [],
    outboxQueries: [],
    actions: [],
  };

  const record = async (request: Request, params: Record<string, unknown>) => {
    state.actions.push({
      path: new URL(request.url).pathname,
      params,
      body: await request.json(),
    });
  };

  const handlers = [
    http.get('*/admin/jobs/queues', () => {
      state.queuesCalls += 1;
      return HttpResponse.json({ success: true, data: state.queues });
    }),
    http.get('*/admin/jobs/failed', ({ request }) => {
      const q = new URL(request.url).searchParams;
      state.failedQueries.push(q);
      const queue = q.get('queue');
      const start = Number(q.get('start') ?? 0);
      const limit = Number(q.get('limit') ?? 30);
      const rows = state.failed.filter((j) => !queue || j.queue === queue);
      return HttpResponse.json({
        success: true,
        data: { items: rows.slice(start, start + limit), total: rows.length },
      });
    }),
    http.post('*/admin/jobs/outbox/:id/requeue', async ({ request, params }) => {
      await record(request, params);
      const event = state.outbox.find((e) => e.id === params.id);
      if (!event || event.status !== 'FAILED') {
        return HttpResponse.json(
          {
            success: false,
            error: { code: 'JOB_003', message: 'Sự kiện outbox không ở trạng thái thất bại' },
          },
          { status: 409 },
        );
      }
      event.status = 'PENDING';
      event.attempts = 0;
      event.lastError = null;
      return HttpResponse.json({ success: true, data: { status: 'PENDING' } });
    }),
    http.get('*/admin/jobs/outbox', ({ request }) => {
      const q = new URL(request.url).searchParams;
      state.outboxQueries.push(q);
      const status = q.get('status') as OutboxStatus | null;
      const type = q.get('type');
      const offset = Number(q.get('cursor') ?? 0);
      const rows = state.outbox.filter(
        (e) => (!status || e.status === status) && (!type || e.type === type),
      );
      const page = rows.slice(offset, offset + pageSize);
      const hasMore = offset + pageSize < rows.length;
      return HttpResponse.json({
        success: true,
        data: page,
        meta: { nextCursor: hasMore ? String(offset + pageSize) : null, hasMore, limit: pageSize },
      });
    }),
    http.post('*/admin/jobs/:queue/:jobId/retry', async ({ request, params }) => {
      await record(request, params);
      const at = state.failed.findIndex(
        (j) => j.queue === params.queue && j.jobId === params.jobId,
      );
      if (at < 0) return notFound();
      state.failed.splice(at, 1);
      return HttpResponse.json({ success: true, data: { retried: true } });
    }),
    http.post('*/admin/jobs/:queue/:jobId/remove', async ({ request, params }) => {
      await record(request, params);
      const at = state.failed.findIndex(
        (j) => j.queue === params.queue && j.jobId === params.jobId,
      );
      if (at < 0) return notFound();
      state.failed.splice(at, 1);
      return HttpResponse.json({ success: true, data: { removed: true } });
    }),
  ];

  return { state, handlers };
}

/** Đăng nhập giả với vai + quyền chi tiết cho `useAuthStore.hasPermission`. */
export function signIn(role: 'admin' | 'manager', permissions: string[]) {
  useAuthStore.getState().setAuth({
    user: {
      id: 'me',
      email: `${role}@congty.vn`,
      name: role === 'admin' ? 'Admin' : 'Quản lý',
      roles: [role],
      permissions,
    },
    token: 'test-token',
  });
}

/** Manager mặc định của hệ thống: xem được nhưng KHÔNG có `system-config:update`. */
export const signInManager = () => signIn('manager', ['system-config:view']);
export const signInAdmin = () => signIn('admin', []);

export function renderWithProviders(ui: ReactElement, route = '/system-config?tab=jobs') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        {ui}
        <JobsLocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { queryClient, ...utils };
}
