/**
 * `AuditLogPage` — bộ lọc đồng bộ URL + query, "Tải thêm" nối trang giữ lọc, drawer chi
 * tiết với `JsonViewer`, các trạng thái tải/rỗng/lỗi, và tính CHỈ ĐỌC.
 *
 * Mock ở tầng HTTP (MSW) — KHÔNG mock service/queries — để đi đúng đường thật (axios,
 * `useQueryParams`, debounce, React Query infinite).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import AuditLogPage from '@/features/audit-log/pages/AuditLogPage';

import {
  OID_ACTOR,
  OID_OTHER,
  OID_WORKSPACE,
  auditLogHandler,
  makeLog,
  type AuditLogRequestLog,
} from './audit-log-fixtures';

const server = setupServer();
// Có bước debounce 300ms + nhiều request nối tiếp — nới ngưỡng `findBy*`/`waitFor` để không vỡ
// oan khi cả bộ test chạy song song.
beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
  server.close();
});

/** Hiện `location.search` ra DOM để khẳng định URL đã đổi. */
function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function renderPage(initialUrl = '/audit-log') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <AuditLogPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const currentSearch = () => new URLSearchParams(screen.getByTestId('search').textContent ?? '');
const lastParams = (log: AuditLogRequestLog) => log.params[log.params.length - 1];

const ROWS = [
  makeLog({ id: 'a1', action: 'user.lock', reason: 'Vi phạm điều khoản sử dụng' }),
  makeLog({
    id: 'a2',
    action: 'system-config.update',
    targetType: 'SystemConfig',
    targetId: 'limits.message',
    actor: { id: OID_OTHER, name: 'Trần Thị Bình', role: 'manager' },
    actorId: OID_OTHER,
    reason: 'x'.repeat(120),
    ip: '203.0.113.7',
    userAgent: 'Mozilla/5.0 (Test)',
    metadata: { before: { max: 4000 }, after: { max: 8000 }, mode: 'NOW' },
    workspaceId: OID_WORKSPACE,
  }),
];

describe('AuditLogPage', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setAuth({
      user: {
        id: 'me',
        email: 'ops@congty.vn',
        name: 'Vận hành',
        roles: ['editor'],
        permissions: ['audit-log:view'],
      },
      token: 'test-token',
    });
  });

  describe('hiển thị', () => {
    it('render dòng: nhãn hành động + mã phụ, tên người thực hiện, đối tượng, lý do cắt 80 ký tự', async () => {
      server.use(auditLogHandler([ROWS]));
      renderPage();

      await waitFor(() => expect(screen.getByText('Khoá tài khoản')).toBeInTheDocument());
      expect(screen.getByText('Sửa cấu hình')).toBeInTheDocument();
      expect(screen.getByText('system-config.update')).toBeInTheDocument();
      expect(screen.getByText('Nguyễn Văn An')).toBeInTheDocument();
      expect(screen.getByText('Trần Thị Bình')).toBeInTheDocument();
      // Lý do dài bị cắt còn 80 ký tự + "…" (đầy đủ nằm ở tooltip/drawer).
      expect(screen.getByText(`${'x'.repeat(80)}…`)).toBeInTheDocument();
      // Đối tượng dẫn sang module tương ứng (User → /user/:id, SystemConfig → tab).
      expect(screen.getAllByRole('link', { name: OID_OTHER })[0]).toHaveAttribute(
        'href',
        `/user/${OID_OTHER}`,
      );
      expect(screen.getByRole('link', { name: 'limits.message' })).toHaveAttribute(
        'href',
        '/system-config?tab=limits',
      );
    });

    it('đang tải → Skeleton', async () => {
      server.use(
        http.get('*/audit-logs', async () => {
          await new Promise((r) => setTimeout(r, 200));
          return HttpResponse.json({
            success: true,
            data: [],
            meta: { nextCursor: null, hasMore: false, limit: 20 },
          });
        }),
      );
      renderPage();

      expect(screen.getAllByRole('status', { name: 'Đang tải' }).length).toBeGreaterThan(0);
      await waitFor(() =>
        expect(screen.queryByRole('status', { name: 'Đang tải' })).not.toBeInTheDocument(),
      );
    });

    it('không có dòng nào → EmptyState; không lọc thì KHÔNG có nút "Xoá bộ lọc"', async () => {
      server.use(auditLogHandler([[]]));
      renderPage();

      await waitFor(() =>
        expect(screen.getByText('Không có nhật ký phù hợp bộ lọc')).toBeInTheDocument(),
      );
      expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument();
    });

    it('rỗng khi đang lọc → "Xoá bộ lọc" xoá sạch bộ lọc khỏi URL', async () => {
      server.use(auditLogHandler([[]]));
      renderPage('/audit-log?action=user.lock&targetType=User');

      const clear = await screen.findByRole('button', { name: 'Xoá bộ lọc' });
      await userEvent.click(clear);

      await waitFor(() => expect(currentSearch().toString()).toBe(''));
    });

    it('lỗi tải → Callout + "Thử lại"', async () => {
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
                data: ROWS,
                meta: { nextCursor: null, hasMore: false, limit: 20 },
              }),
        ),
      );
      renderPage();

      expect(await screen.findByText('Không tải được nhật ký')).toBeInTheDocument();
      fail = false;
      await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

      await waitFor(() => expect(screen.getByText('Khoá tài khoản')).toBeInTheDocument());
    });
  });

  describe('bộ lọc ↔ URL ↔ query', () => {
    it('chọn hành động (nhiều lựa chọn) → URL `action=a,b` và query gửi `action=a,b`', async () => {
      const log: AuditLogRequestLog = { params: [] };
      server.use(auditLogHandler([ROWS], log));
      renderPage();
      await screen.findByText('Nguyễn Văn An');

      await userEvent.click(screen.getByText('Mọi hành động'));
      // "Sửa cấu hình" còn xuất hiện ở dòng bảng — chọn đúng ô tick trong danh sách.
      await userEvent.click(await screen.findByRole('checkbox', { name: 'Mở khoá tài khoản' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Sửa cấu hình' }));

      await waitFor(() =>
        expect(currentSearch().get('action')).toBe('user.unlock,system-config.update'),
      );
      await waitFor(() =>
        expect(lastParams(log).get('action')).toBe('user.unlock,system-config.update'),
      );
    });

    it('chọn loại đối tượng → URL + query có `targetType`', async () => {
      const log: AuditLogRequestLog = { params: [] };
      server.use(auditLogHandler([ROWS], log));
      renderPage();
      await screen.findByText('Nguyễn Văn An');

      await userEvent.click(screen.getByText('Mọi đối tượng'));
      await userEvent.click(await screen.findByRole('option', { name: 'Người dùng' }));

      await waitFor(() => expect(currentSearch().get('targetType')).toBe('User'));
      await waitFor(() => expect(lastParams(log).get('targetType')).toBe('User'));
    });

    it('gõ ID người thực hiện hợp lệ → URL + query (sau debounce); ID dở dang KHÔNG bắn query', async () => {
      const log: AuditLogRequestLog = { params: [] };
      server.use(auditLogHandler([ROWS], log));
      renderPage();
      await screen.findByText('Nguyễn Văn An');
      const before = log.params.length;

      const input = screen.getByPlaceholderText('ID người thực hiện');
      await userEvent.type(input, '665f1c2e');
      // Đợi quá thời gian debounce: ID chưa đủ 24 ký tự → không được gọi API với nó.
      await new Promise((r) => setTimeout(r, 450));
      expect(log.params.length).toBe(before);
      expect(log.params.some((p) => p.has('actorId'))).toBe(false);

      await userEvent.clear(input);
      await userEvent.type(input, OID_ACTOR);

      await waitFor(() => expect(currentSearch().get('actorId')).toBe(OID_ACTOR));
      await waitFor(() => expect(lastParams(log).get('actorId')).toBe(OID_ACTOR), {
        timeout: 3000,
      });
    });

    it('bấm tên người thực hiện trong bảng → lọc theo người đó (URL + query)', async () => {
      const log: AuditLogRequestLog = { params: [] };
      server.use(auditLogHandler([ROWS], log));
      renderPage();

      await userEvent.click(await screen.findByRole('link', { name: 'Trần Thị Bình' }));

      await waitFor(() => expect(currentSearch().get('actorId')).toBe(OID_OTHER));
      await waitFor(() => expect(lastParams(log).get('actorId')).toBe(OID_OTHER), {
        timeout: 3000,
      });
      // Bấm link KHÔNG được mở drawer chi tiết của dòng.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('khoảng ngày (gõ tay) → URL `from`/`to` + query là mốc ISO đầu/cuối ngày', async () => {
      const log: AuditLogRequestLog = { params: [] };
      server.use(auditLogHandler([ROWS], log));
      renderPage();
      await screen.findByText('Nguyễn Văn An');

      const range = screen.getByPlaceholderText('Khoảng ngày');
      await userEvent.type(range, '01/09/2026 - 19/09/2026{Enter}');

      await waitFor(() => {
        expect(currentSearch().get('from')).toBe('2026-09-01');
        expect(currentSearch().get('to')).toBe('2026-09-19');
      });
      await waitFor(() => expect(lastParams(log).has('from')).toBe(true));
      const { from, to } = { from: lastParams(log).get('from'), to: lastParams(log).get('to') };
      expect(new Date(from ?? '').getTime()).toBe(new Date(2026, 8, 1, 0, 0, 0, 0).getTime());
      expect(new Date(to ?? '').getTime()).toBe(new Date(2026, 8, 19, 23, 59, 59, 999).getTime());
    });

    it('mở trang với URL có sẵn bộ lọc → query đi kèm ngay; `page=` không rác lên URL', async () => {
      const log: AuditLogRequestLog = { params: [] };
      server.use(auditLogHandler([ROWS], log));
      renderPage(`/audit-log?actorId=${OID_ACTOR}&action=user.lock&workspaceId=${OID_WORKSPACE}`);
      // Tên người đang lọc hiện cả ở chip cạnh ô lọc lẫn ở dòng bảng.
      expect((await screen.findAllByText('Nguyễn Văn An')).length).toBeGreaterThanOrEqual(2);

      const first = log.params[0];
      expect(first.get('actorId')).toBe(OID_ACTOR);
      expect(first.get('action')).toBe('user.lock');
      expect(first.get('workspaceId')).toBe(OID_WORKSPACE);
      expect(currentSearch().has('page')).toBe(false);
    });

    it('`?focus=actor` (từ ⌘K) → focus ô người thực hiện rồi bỏ `focus` khỏi URL', async () => {
      server.use(auditLogHandler([ROWS]));
      renderPage('/audit-log?focus=actor');

      await waitFor(() => expect(screen.getByPlaceholderText('ID người thực hiện')).toHaveFocus());
      await waitFor(() => expect(currentSearch().has('focus')).toBe(false));
    });
  });

  describe('"Tải thêm" (cursor)', () => {
    it('nối trang vào dưới, GIỮ nguyên bộ lọc, hết trang thì mất nút', async () => {
      const log: AuditLogRequestLog = { params: [] };
      server.use(
        auditLogHandler(
          [
            [makeLog({ id: 'p1', reason: 'Lý do trang một' })],
            [makeLog({ id: 'p2', reason: 'Lý do trang hai' })],
          ],
          log,
        ),
      );
      renderPage('/audit-log?targetType=User&action=user.lock');

      await screen.findByText('Lý do trang một');
      await userEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));

      await waitFor(() => expect(screen.getByText('Lý do trang hai')).toBeInTheDocument());
      expect(screen.getByText('Lý do trang một')).toBeInTheDocument();

      const second = lastParams(log);
      expect(second.get('cursor')).toBe('page-1');
      expect(second.get('targetType')).toBe('User');
      expect(second.get('action')).toBe('user.lock');
      expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
    });

    it('KHÔNG dùng phân trang theo trang: không có nút chuyển trang/`page` trong URL', async () => {
      server.use(auditLogHandler([[makeLog({ id: 'p1' })], [makeLog({ id: 'p2' })]]));
      renderPage();

      await screen.findByRole('button', { name: 'Tải thêm' });
      await userEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Tải thêm' })).toBeNull());
      expect(currentSearch().has('page')).toBe(false);
      expect(screen.queryByRole('navigation', { name: /phân trang|pagination/i })).toBeNull();
    });
  });

  describe('drawer chi tiết', () => {
    it('bấm dòng → drawer hiện JsonViewer metadata, before/after, IP, lý do đầy đủ', async () => {
      server.use(auditLogHandler([ROWS]));
      renderPage();

      await userEvent.click(await screen.findByText('Sửa cấu hình'));

      const dialog = await screen.findByRole('dialog');
      // Metadata dạng JSON (JsonViewer là <pre>) — có cả khoá ngoài before/after.
      const metadata = within(dialog).getByRole('region', { name: 'Metadata' });
      expect(metadata.querySelector('pre')?.textContent).toContain('"mode": "NOW"');
      // Khối so sánh Trước/Sau.
      const diff = within(dialog).getByRole('region', { name: 'So sánh trước và sau' });
      expect(diff.textContent).toContain('4000');
      expect(diff.textContent).toContain('8000');
      // Trường chỉ có trong drawer.
      expect(within(dialog).getByText('203.0.113.7')).toBeInTheDocument();
      expect(within(dialog).getByText('Mozilla/5.0 (Test)')).toBeInTheDocument();
      expect(within(dialog).getByText('x'.repeat(120))).toBeInTheDocument();
      // Workspace dẫn sang trang workspace.
      expect(within(dialog).getByRole('link', { name: OID_WORKSPACE })).toHaveAttribute(
        'href',
        `/workspace/${OID_WORKSPACE}`,
      );
    });

    it('metadata rỗng → "—", không khối so sánh', async () => {
      server.use(auditLogHandler([[makeLog({ id: 'a1', metadata: null })]]));
      renderPage();

      await userEvent.click(await screen.findByText('Khoá tài khoản'));

      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByRole('region', { name: 'Metadata' }).querySelector('pre')?.textContent,
      ).toBe('—');
      expect(within(dialog).queryByRole('region', { name: 'So sánh trước và sau' })).toBeNull();
    });

    it('đóng drawer bằng nút "Đóng"', async () => {
      server.use(auditLogHandler([ROWS]));
      renderPage();

      await userEvent.click(await screen.findByText('Khoá tài khoản'));
      await screen.findByRole('dialog');
      await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  describe('chỉ đọc tuyệt đối', () => {
    it('trang không có nút sửa/xoá/lưu/tạo, và drawer cũng vậy (chỉ có "Chép" và "Đóng")', async () => {
      server.use(auditLogHandler([ROWS]));
      renderPage();

      const MUTATING = /^(sửa|xoá|xóa|lưu|tạo|thêm|cập nhật|gỡ|huỷ)\b/i;
      await screen.findByText('Nguyễn Văn An');
      const names = () => screen.getAllByRole('button').map((b) => b.textContent?.trim() ?? '');
      expect(names().filter((n) => MUTATING.test(n))).toEqual([]);

      await userEvent.click(screen.getByText('Sửa cấu hình'));
      const dialog = await screen.findByRole('dialog');
      const drawerButtons = within(dialog)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '');
      expect(drawerButtons.filter((n) => MUTATING.test(n))).toEqual([]);
      expect(drawerButtons).toEqual(expect.arrayContaining(['Đóng', 'Chép']));
    });

    it('chỉ gọi GET /audit-logs — không bao giờ POST/PATCH/PUT/DELETE', async () => {
      const methods: string[] = [];
      server.events.on('request:start', ({ request }) => methods.push(request.method));
      server.use(auditLogHandler([ROWS, [makeLog({ id: 'z' })]]));
      renderPage();

      await userEvent.click(await screen.findByText('Sửa cấu hình'));
      await screen.findByRole('dialog');
      await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
      await userEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
      await waitFor(() => expect(methods.length).toBeGreaterThanOrEqual(2));

      server.events.removeAllListeners();
      expect(new Set(methods)).toEqual(new Set(['GET']));
    });
  });
});
