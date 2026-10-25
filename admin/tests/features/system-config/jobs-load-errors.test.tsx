/**
 * Sub-tab "Job lỗi" và "Outbox" — API lỗi phải báo lỗi + "Thử lại", KHÔNG được vẽ bảng rỗng.
 *
 * Trước đây `useFailedJobs`/`useOutbox` lỗi ⇒ bảng hiện "Không có job lỗi nào" / "Không có sự kiện
 * outbox nào khớp bộ lọc" — câu trấn an SAI đúng lúc API hỏng, trên màn hình của người vận hành.
 *
 * Mock ở tầng HTTP (MSW).
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import JobsTab from '@/features/system-config/jobs/JobsTab';

import {
  createJobsBackend,
  makeFailedJob,
  makeOutbox,
  renderWithProviders,
  signInAdmin,
} from './jobs-test-utils';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signInAdmin();
});

const serverError = () =>
  HttpResponse.json(
    { success: false, error: { code: 'SYS_500', message: 'Lỗi máy chủ' } },
    { status: 500 },
  );

describe('Job lỗi — lỗi tải', () => {
  it('báo lỗi + "Thử lại", KHÔNG hiện "Không có job lỗi nào"; thử lại thành công thì hiện job', async () => {
    server.use(http.get('*/admin/jobs/failed', serverError));
    const user = userEvent.setup();
    renderWithProviders(<JobsTab />, '/system-config?tab=jobs&sub=failed');

    expect(await screen.findByText('Không tải được danh sách job lỗi')).toBeInTheDocument();
    expect(screen.queryByText('Không có job lỗi nào')).not.toBeInTheDocument();

    const { handlers } = createJobsBackend({ failed: [makeFailedJob()] });
    server.resetHandlers();
    server.use(...handlers);
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('SMTP timeout khi gửi thư chào')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được danh sách job lỗi')).not.toBeInTheDocument();
  });

  it('không có job lỗi THẬT (API ổn) vẫn hiện "Không có job lỗi nào"', async () => {
    const { handlers } = createJobsBackend({ failed: [] });
    server.use(...handlers);
    renderWithProviders(<JobsTab />, '/system-config?tab=jobs&sub=failed');

    expect(await screen.findByText('Không có job lỗi nào')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được danh sách job lỗi')).not.toBeInTheDocument();
  });
});

describe('Outbox — lỗi tải', () => {
  it('báo lỗi + "Thử lại", KHÔNG hiện "Không có sự kiện outbox nào khớp bộ lọc"', async () => {
    server.use(http.get('*/admin/jobs/outbox', serverError));
    const user = userEvent.setup();
    renderWithProviders(<JobsTab />, '/system-config?tab=jobs&sub=outbox');

    expect(await screen.findByText('Không tải được sự kiện outbox')).toBeInTheDocument();
    expect(screen.queryByText('Không có sự kiện outbox nào khớp bộ lọc')).not.toBeInTheDocument();

    const { handlers } = createJobsBackend({ outbox: [makeOutbox()] });
    server.resetHandlers();
    server.use(...handlers);
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('call.ring-timeout.schedule')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được sự kiện outbox')).not.toBeInTheDocument();
  });
});
