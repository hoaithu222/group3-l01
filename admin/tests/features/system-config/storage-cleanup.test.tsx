/**
 * "Chạy dọn tệp mồ côi ngay" (p0-05 admin.md §2.1, §4) — hộp xác nhận bắt buộc lý do ≥ 10 ký
 * tự, gọi đúng `POST /admin/storage/cleanup { reason }`, báo kết quả, và lỗi giữ hộp mở.
 *
 * Mock ở tầng HTTP (MSW) để đi đúng đường thật (axios interceptor, React Query).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import StorageTab from '@/features/system-config/storage/StorageTab';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

const STATS = {
  totals: { bytes: 1024, count: 3 },
  byScope: [],
  byKind: [],
  byStatus: [],
  orphan: { count: 2, bytes: 512 },
  storageType: 'local',
};

interface CleanupBody {
  reason: string;
}

let cleanupBodies: CleanupBody[] = [];
let statsCalls = 0;

const server = setupServer(
  http.get('*/admin/storage/stats', () => {
    statsCalls += 1;
    return HttpResponse.json({ success: true, data: STATS });
  }),
  http.get('*/capabilities', () =>
    HttpResponse.json({
      success: true,
      data: {
        features: {},
        limits: {},
        upload: { maxFileBytes: 1024, allowedMime: [], signedUrlTtlSeconds: 60 },
      },
    }),
  ),
  // p3-01: nhóm "Kho tài liệu" của tab đọc danh sách khoá cấu hình — không liên quan việc dọn tệp.
  http.get('*/admin/system-config', () => HttpResponse.json({ success: true, data: [] })),
  http.post('*/admin/storage/cleanup', async ({ request }) => {
    cleanupBodies.push((await request.json()) as CleanupBody);
    return HttpResponse.json({
      success: true,
      data: { jobId: 'assets.cleanup:manual:2026091907', alreadyQueued: false },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/system-config?tab=storage']}>
        <StorageTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openModal() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Chạy dọn tệp mồ côi ngay' }));
  return { user, reason: await screen.findByLabelText(/Lý do/) };
}

describe('Chạy dọn tệp mồ côi ngay', () => {
  beforeEach(() => {
    cleanupBodies = [];
    statsCalls = 0;
    useToastStore.setState({ toasts: [] });
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setAuth({
      user: {
        id: 'me',
        email: 'a@x.vn',
        name: 'Admin',
        roles: ['manager'],
        permissions: ['system-config:view', 'system-config:update'],
      },
      token: 'test-token',
    });
  });

  it('lý do < 10 ký tự: báo lỗi và KHÔNG gọi BE', async () => {
    renderTab();
    const { user, reason } = await openModal();

    await user.type(reason, 'ngan');
    await user.click(screen.getByRole('button', { name: 'Chạy dọn' }));

    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(cleanupBodies).toHaveLength(0);
  });

  it('đủ lý do: gọi đúng POST /admin/storage/cleanup với { reason }, đóng hộp, báo thành công và làm mới số liệu', async () => {
    renderTab();
    const { user, reason } = await openModal();
    await waitFor(() => expect(statsCalls).toBe(1));

    await user.type(reason, 'Dọn thủ công trước đợt kiểm kê');
    await user.click(screen.getByRole('button', { name: 'Chạy dọn' }));

    await waitFor(() =>
      expect(cleanupBodies).toEqual([{ reason: 'Dọn thủ công trước đợt kiểm kê' }]),
    );
    await waitFor(() => expect(screen.queryByLabelText(/Lý do/)).not.toBeInTheDocument());
    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => [t.type, t.title])).toContainEqual([
        'success',
        expect.stringContaining('Đã xếp lịch dọn tệp mồ côi'),
      ]),
    );
    // Số liệu được invalidate → gọi lại `GET /admin/storage/stats`.
    await waitFor(() => expect(statsCalls).toBeGreaterThan(1));
  });

  it('giờ này đã có lượt thủ công (alreadyQueued) → cảnh báo, không báo thành công', async () => {
    server.use(
      http.post('*/admin/storage/cleanup', () =>
        HttpResponse.json({
          success: true,
          data: { jobId: 'assets.cleanup:manual:2026091907', alreadyQueued: true },
        }),
      ),
    );
    renderTab();
    const { user, reason } = await openModal();

    await user.type(reason, 'Dọn thủ công lần thứ hai');
    await user.click(screen.getByRole('button', { name: 'Chạy dọn' }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.type)).toContain('warning'),
    );
    expect(useToastStore.getState().toasts.map((t) => t.type)).not.toContain('success');
  });

  it('BE từ chối (403) → hộp xác nhận vẫn mở, lý do còn nguyên để thử lại', async () => {
    server.use(
      http.post('*/admin/storage/cleanup', () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'AUTH_005', message: 'Bạn không có quyền thực hiện hành động này' },
          },
          { status: 403 },
        ),
      ),
    );
    renderTab();
    const { user, reason } = await openModal();

    await user.type(reason, 'Dọn thủ công khi không đủ quyền');
    await user.click(screen.getByRole('button', { name: 'Chạy dọn' }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.type)).toContain('error'),
    );
    expect(screen.getByLabelText(/Lý do/)).toHaveValue('Dọn thủ công khi không đủ quyền');
  });
});
