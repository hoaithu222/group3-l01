/**
 * Chấm số "báo cáo chờ" ở menu Dock (p1-08 admin.md §1: `badge: 'moderation-open'`, realtime từ
 * `admin:moderation`). Dựng `AppDock` thật (registry + lọc quyền/cờ) với MSW + socket giả.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MODULE_REGISTRY } from '@/app/router/modules/module-registry';
import { AppDock } from '@/app/shell';
import { SocketEvent } from '@/core/socket';

import { emitFromServer, fakeSocket, joinPayloads } from './fake-socket';
import { okJson, pageMeta, PERM_VIEW, signIn } from './moderation-fixtures';

vi.mock('socket.io-client', async () => {
  const { fakeSocket: socket } = await import('./fake-socket');
  return { io: vi.fn(() => socket) };
});

let openTotal = 7;
let listRequests: URL[] = [];
let listStatus = 200;

const server = setupServer(
  http.get('*/capabilities', () =>
    okJson({ features: { communication: { enabled: true, available: true } } }),
  ),
  http.get('*/admin/reports', ({ request }) => {
    listRequests.push(new URL(request.url));
    if (listStatus !== 200) {
      return HttpResponse.json(
        { success: false, error: { code: 'SYS_500', message: 'Lỗi máy chủ' } },
        { status: listStatus },
      );
    }
    return okJson([], pageMeta(openTotal, 1, 1));
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderDock() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppDock />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const moderationLink = () => screen.findByRole('link', { name: /^Kiểm duyệt/ });

describe('chấm số báo cáo chờ ở menu', () => {
  beforeEach(() => {
    openTotal = 7;
    listRequests = [];
    listStatus = 200;
    fakeSocket.emit.mockClear();
  });

  it('registry: mục Kiểm duyệt khai badge = khoá bộ đếm `moderation-open`', () => {
    expect(MODULE_REGISTRY.find((m) => m.id === 'moderation')?.badge).toBe('moderation-open');
  });

  it('có moderation:view → hiện số nhóm báo cáo OPEN (meta.total) và câu đọc cho trình đọc màn hình', async () => {
    signIn(PERM_VIEW);
    renderDock();

    const link = await moderationLink();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Kiểm duyệt, 7 báo cáo chờ xử lý' })).toBe(link),
    );
    expect(link).toHaveTextContent('7');
    // Chỉ hỏi BE MỘT dòng trạng thái OPEN — không tải cả danh sách.
    expect(listRequests[0]?.searchParams.get('status')).toBe('OPEN');
    expect(listRequests[0]?.searchParams.get('limit')).toBe('1');
    // Vào phòng realtime của hàng đợi.
    expect(joinPayloads()).toContainEqual({ kind: 'admin', id: 'moderation' });
  });

  it('từ 100 nhóm trở lên → hiện 99+', async () => {
    openTotal = 120;
    signIn(PERM_VIEW);
    renderDock();

    expect(await screen.findByText('99+')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kiểm duyệt, 120 báo cáo chờ xử lý' })).toBeInTheDocument();
  });

  it('không còn báo cáo chờ → không hiện chấm, tên mục giữ nguyên', async () => {
    openTotal = 0;
    signIn(PERM_VIEW);
    renderDock();

    const link = await moderationLink();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(0));
    expect(link).toHaveAccessibleName('Kiểm duyệt');
    expect(link).not.toHaveTextContent(/\d/);
  });

  it('realtime moderation:report-created → tải lại số đếm và cập nhật chấm', async () => {
    signIn(PERM_VIEW);
    renderDock();
    await screen.findByRole('link', { name: 'Kiểm duyệt, 7 báo cáo chờ xử lý' });

    openTotal = 8;
    emitFromServer(SocketEvent.MODERATION_REPORT_CREATED);

    expect(
      await screen.findByRole('link', { name: 'Kiểm duyệt, 8 báo cáo chờ xử lý' }),
    ).toBeInTheDocument();

    openTotal = 5;
    emitFromServer(SocketEvent.MODERATION_REPORT_UPDATED);
    expect(
      await screen.findByRole('link', { name: 'Kiểm duyệt, 5 báo cáo chờ xử lý' }),
    ).toBeInTheDocument();
  });

  it('thiếu moderation:view → không có mục menu, không gọi API, không vào phòng socket', async () => {
    signIn(['user:view']);
    renderDock();

    await screen.findByRole('link', { name: /Người dùng/ });
    expect(screen.queryByRole('link', { name: /^Kiểm duyệt/ })).not.toBeInTheDocument();
    expect(listRequests).toHaveLength(0);
    expect(joinPayloads()).not.toContainEqual({ kind: 'admin', id: 'moderation' });
  });

  it('BE lỗi → không hiện chấm (không vẽ 0 giả), menu vẫn dùng được', async () => {
    listStatus = 500;
    signIn(PERM_VIEW);
    renderDock();

    const link = await moderationLink();
    await waitFor(() => expect(listRequests.length).toBeGreaterThan(0));
    expect(link).toHaveAccessibleName('Kiểm duyệt');
    expect(link).not.toHaveTextContent(/\d/);
  });
});
