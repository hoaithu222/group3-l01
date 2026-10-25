/**
 * `AuditTrailPanel` — đọc ĐÚNG hình dạng BE: thời gian ở `at`, tên người thực hiện ở
 * `actor.name` (rơi về `actorId` khi user đã bị xoá), nối trang bằng "Tải thêm".
 *
 * Bản cũ đọc `createdAt`/`actorName` (BE không trả) nên cột thời gian trống và tên rơi về
 * id — bài kiểm này chặn tái phạm bằng dữ liệu đúng kiểu BE.
 *
 * Mock ở tầng HTTP (MSW), không mock service/queries.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ComponentProps } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import { formatDate } from '@/shared/utils/format';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import {
  OID_ACTOR,
  OID_OTHER,
  OID_WORKSPACE,
  auditLogHandler,
  makeLog,
  type AuditLogRequestLog,
} from '../../features/audit-log/audit-log-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPanel(props: Partial<ComponentProps<typeof AuditTrailPanel>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditTrailPanel targetId={OID_OTHER} targetType="User" {...props} />
    </QueryClientProvider>,
  );
}

function signIn(permissions: string[]) {
  useAuthStore.getState().setAuth({
    user: {
      id: 'me',
      email: 'ops@congty.vn',
      name: 'Vận hành',
      roles: ['editor'],
      permissions,
    },
    token: 'test-token',
  });
}

describe('AuditTrailPanel', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
    signIn(['audit-log:view']);
  });

  it('hiện thời gian (từ `at`) và tên người thực hiện (từ `actor.name`)', async () => {
    const at = '2026-09-18T03:04:05.000Z';
    server.use(auditLogHandler([[makeLog({ id: 'a1', at })]]));
    renderPanel();

    await waitFor(() => expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument());

    // Ô thời gian KHÔNG được trống — đúng lỗi cũ (đọc `createdAt` không tồn tại).
    const time = formatDate(at, 'HH:mm DD/MM/YYYY');
    expect(time).toMatch(/^\d{2}:\d{2} \d{2}\/\d{2}\/\d{4}$/);
    expect(screen.getByText(time)).toBeInTheDocument();
    // Tên hiển thị, KHÔNG phải id thô.
    expect(screen.queryByText(OID_ACTOR)).not.toBeInTheDocument();
  });

  it('dùng nhãn tiếng Việt cho hành động kèm mã phụ; hành động lạ rơi về mã', async () => {
    server.use(
      auditLogHandler([
        [
          makeLog({ id: 'a1', action: 'user.lock' }),
          makeLog({ id: 'a2', action: 'future.new-action' }),
        ],
      ]),
    );
    renderPanel();

    await waitFor(() => expect(screen.getByText('Khoá tài khoản')).toBeInTheDocument());
    expect(screen.getByText('user.lock')).toBeInTheDocument();
    expect(screen.getByText('future.new-action')).toBeInTheDocument();
  });

  it('actor = null (user đã xoá) → rơi về actorId', async () => {
    server.use(
      auditLogHandler([[makeLog({ id: 'a1', actor: null, actorId: '665f1c2e8a1b2c3d4e5f6aaa' })]]),
    );
    renderPanel();

    await waitFor(() => expect(screen.getByText('665f1c2e8a1b2c3d4e5f6aaa')).toBeInTheDocument());
  });

  it('gửi đúng targetType/targetId/limit và nối trang bằng "Tải thêm"', async () => {
    const log: AuditLogRequestLog = { params: [] };
    server.use(
      auditLogHandler(
        [
          [makeLog({ id: 'a1', reason: 'Lý do trang một' })],
          [makeLog({ id: 'a2', reason: 'Lý do trang hai', actor: null, actorId: 'ghost' })],
        ],
        log,
      ),
    );
    renderPanel({ limit: 1 });

    await waitFor(() => expect(screen.getByText('Lý do trang một')).toBeInTheDocument());
    expect(log.params[0].get('targetType')).toBe('User');
    expect(log.params[0].get('targetId')).toBe(OID_OTHER);
    expect(log.params[0].get('limit')).toBe('1');
    expect(log.params[0].get('cursor')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));

    // Trang 2 NỐI vào dưới trang 1 (không thay thế).
    await waitFor(() => expect(screen.getByText('Lý do trang hai')).toBeInTheDocument());
    expect(screen.getByText('Lý do trang một')).toBeInTheDocument();
    expect(log.params[1].get('cursor')).toBe('page-1');
    expect(log.params[1].get('targetId')).toBe(OID_OTHER);
    // Hết trang → nút biến mất.
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
  });

  it('lọc theo mã hành động → gửi `action` là các mã ngăn dấu phẩy (BE lọc IN), giữ targetType/targetId', async () => {
    const log: AuditLogRequestLog = { params: [] };
    server.use(auditLogHandler([[makeLog({ id: 'a1', action: 'resource.purge' })]], log));
    renderPanel({
      targetId: OID_WORKSPACE,
      targetType: 'WORKSPACE',
      actions: ['resource.purge', 'resource.quota-override'],
    });

    await waitFor(() =>
      expect(screen.getByText('Dọn vĩnh viễn tệp trong thùng rác')).toBeInTheDocument(),
    );
    expect(log.params[0].get('action')).toBe('resource.purge,resource.quota-override');
    expect(log.params[0].get('targetType')).toBe('WORKSPACE');
    expect(log.params[0].get('targetId')).toBe(OID_WORKSPACE);
  });

  it('lọc theo workspace, không có đối tượng → chỉ gửi workspaceId + action (không targetType/targetId)', async () => {
    const log: AuditLogRequestLog = { params: [] };
    server.use(auditLogHandler([[makeLog({ id: 'a1', action: 'guest.update' })]], log));
    renderPanel({
      targetId: undefined,
      targetType: undefined,
      workspaceId: OID_WORKSPACE,
      actions: ['guest.update', 'invitation.create'],
    });

    await waitFor(() => expect(screen.getByText('Sửa hạn/kênh của khách')).toBeInTheDocument());
    expect(log.params[0].get('workspaceId')).toBe(OID_WORKSPACE);
    expect(log.params[0].get('action')).toBe('guest.update,invitation.create');
    expect(log.params[0].get('targetType')).toBeNull();
    expect(log.params[0].get('targetId')).toBeNull();
  });

  it('không truyền actions → KHÔNG gửi tham số action (mọi hành động)', async () => {
    const log: AuditLogRequestLog = { params: [] };
    server.use(auditLogHandler([[makeLog({ id: 'a1' })]], log));
    renderPanel();

    await waitFor(() => expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument());
    expect(log.params[0].get('action')).toBeNull();
  });

  it('không có nhật ký → trạng thái rỗng, không nút "Tải thêm"', async () => {
    server.use(auditLogHandler([[]]));
    renderPanel();

    await waitFor(() => expect(screen.getByText('Chưa có nhật ký')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
  });

  it('lỗi tải → Callout + "Thử lại" gọi lại được', async () => {
    let fail = true;
    server.use(
      http.get('*/audit-logs', () =>
        fail
          ? HttpResponse.json(
              { success: false, error: { code: 'SYS_500', message: 'Lỗi máy chủ' } },
              { status: 500 },
            )
          : HttpResponse.json({
              success: true,
              data: [makeLog({ id: 'a1', reason: 'Đã khôi phục' })],
              meta: { nextCursor: null, hasMore: false, limit: 20 },
            }),
      ),
    );
    renderPanel();

    const retry = await screen.findByRole('button', { name: 'Thử lại' });
    fail = false;
    await userEvent.click(retry);

    await waitFor(() => expect(screen.getByText('Đã khôi phục')).toBeInTheDocument());
  });

  it('thiếu quyền audit-log:view → báo không có quyền và KHÔNG gọi API', async () => {
    useAuthStore.getState().clearAuth();
    signIn(['user:view']);
    let called = false;
    server.use(
      http.get('*/audit-logs', () => {
        called = true;
        return HttpResponse.json({ success: true, data: [], meta: {} });
      }),
    );
    const { container } = renderPanel();

    expect(
      within(container).getByText('Bạn không có quyền xem nhật ký quản trị.'),
    ).toBeInTheDocument();
    // Đợi một nhịp để chắc chắn không có request nào bay đi.
    await new Promise((r) => setTimeout(r, 50));
    expect(called).toBe(false);
  });
});
