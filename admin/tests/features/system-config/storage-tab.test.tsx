/**
 * Tab `storage` của trang `system-config` (p0-05 admin.md §2.1, §4) — số liệu từ
 * `GET /admin/storage/stats`, hai bảng, giới hạn hiện hành chỉ đọc, lọc workspace, và
 * quyền (manager KHÔNG thấy nút "Chạy dọn tệp mồ côi ngay").
 *
 * Mock ở tầng HTTP (MSW) để đi đúng đường thật (axios interceptor, React Query, URL state).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import StorageTab from '@/features/system-config/storage/StorageTab';
import { matchesSearch } from '@/shared/utils/format/string.utils';

const MiB = 1024 * 1024;
const WS_ID = '507f1f77bcf86cd799439011';

const STATS = {
  totals: { bytes: 25 * MiB, count: 1234 },
  byScope: [
    { key: 'MESSAGE', count: 800, bytes: 20 * MiB },
    { key: 'AVATAR', count: 400, bytes: 4 * MiB },
    { key: 'MEETING', count: 34, bytes: 1 * MiB },
  ],
  byKind: [
    { key: 'FILE', count: 200, bytes: 9 * MiB },
    { key: 'IMAGE', count: 1000, bytes: 15 * MiB },
    { key: 'VIDEO', count: 34, bytes: 1 * MiB },
  ],
  // BE chỉ trả nhóm đã có tệp — UI phải tự bù đủ 5 trạng thái.
  byStatus: [
    { key: 'READY', count: 1200, bytes: 24 * MiB },
    { key: 'REJECTED', count: 20, bytes: 1 * MiB },
    { key: 'PROCESSING', count: 14, bytes: 0 },
  ],
  orphan: { count: 7, bytes: 3 * MiB },
  storageType: 's3',
};

const WS_STATS = {
  ...STATS,
  totals: { bytes: 2 * MiB, count: 42 },
  orphan: { count: 0, bytes: 0 },
};

const WORKSPACES = [
  { id: WS_ID, name: 'Công ty Alpha' },
  { id: '507f1f77bcf86cd799439022', name: 'Nhóm Beta' },
];

const CAPABILITIES = {
  version: '1.0.0',
  features: {},
  upload: {
    maxFileBytes: 25 * MiB,
    allowedMime: ['image/jpeg', 'image/png', 'audio/mp4'],
    signedUrlTtlSeconds: 60,
  },
  limits: {
    upload: {
      kinds: {
        IMAGE: { maxBytes: 20 * MiB, mime: ['image/jpeg', 'image/png'] },
        VOICE: { maxBytes: 10 * MiB, maxSeconds: 300, mime: ['audio/mp4'] },
      },
    },
  },
};

const statsQueries: Array<string | null> = [];
const workspaceQueries: Array<string | null> = [];

const server = setupServer(
  http.get('*/admin/storage/stats', ({ request }) => {
    const ws = new URL(request.url).searchParams.get('workspaceId');
    statsQueries.push(ws);
    return HttpResponse.json({ success: true, data: ws ? WS_STATS : STATS });
  }),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: CAPABILITIES })),
  // p3-01: nhóm "Kho tài liệu" của tab đọc danh sách khoá cấu hình — các test ở đây không kiểm nhóm đó
  // (xem `resource-quota-config.test.tsx`), nên trả rỗng để không có gì ngoài số liệu lưu trữ.
  http.get('*/admin/system-config', () => HttpResponse.json({ success: true, data: [] })),
  http.get('*/admin/workspaces', ({ request }) => {
    const q = new URL(request.url).searchParams.get('q');
    workspaceQueries.push(q);
    const rows = q ? WORKSPACES.filter((w) => matchesSearch([w.name], q)) : WORKSPACES;
    return HttpResponse.json({
      success: true,
      data: rows,
      meta: { page: 1, limit: 8, total: rows.length },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function signIn(permissions: string[]) {
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Admin', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

function renderTab(url = '/system-config?tab=storage') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <StorageTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StorageTab', () => {
  beforeEach(() => {
    statsQueries.length = 0;
    workspaceQueries.length = 0;
    useAuthStore.getState().clearAuth();
  });

  it('render số liệu: 4 thẻ tổng quan từ BE', async () => {
    signIn(['system-config:view']);
    renderTab();

    // "Tổng dung lượng" = 25 MiB; "Loại storage" đọc từ `storageType`.
    expect(await screen.findByText('Tổng dung lượng')).toBeInTheDocument();
    expect(screen.getAllByText('25 MB').length).toBeGreaterThan(0);
    expect(screen.getByText('Amazon S3')).toBeInTheDocument();
    // "Số tệp" (số đếm lên — DOM luôn có bản sr-only ở giá trị đích) và "Tệp mồ côi".
    expect(screen.getAllByText('1.234').length).toBeGreaterThan(0);
    expect(screen.getByText('Tệp mồ côi (chờ dọn)')).toBeInTheDocument();
    expect(screen.getByText('3 MB sẽ được giải phóng')).toBeInTheDocument();
  });

  it('bảng "Theo loại tệp" sắp theo dung lượng giảm dần kèm % dung lượng', async () => {
    signIn(['system-config:view']);
    renderTab();

    await screen.findByText('Theo loại tệp');
    // Thứ tự trong DOM: loại tệp → trạng thái → giới hạn hiện hành.
    const [table] = await screen.findAllByRole('table');
    const rows = within(table!).getAllByRole('row').slice(1); // bỏ hàng tiêu đề

    expect(rows.map((r) => within(r).getAllByRole('cell')[0]?.textContent)).toEqual([
      'Ảnh',
      'Tệp / tài liệu',
      'Video',
    ]);
    // 15 / 25 MiB = 60%; 9 / 25 = 36%; 1 / 25 = 4%.
    expect(within(rows[0]!).getByText('60,0%')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('36,0%')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('4,0%')).toBeInTheDocument();
  });

  it('bảng "Theo trạng thái" luôn đủ 5 hàng theo vòng đời, thiếu nhóm thì 0', async () => {
    signIn(['system-config:view']);
    renderTab();

    await screen.findByText('Theo trạng thái');
    const table = (await screen.findAllByRole('table'))[1]!;
    const rows = within(table).getAllByRole('row').slice(1);

    expect(rows.map((r) => within(r).getAllByRole('cell')[0]?.textContent)).toEqual([
      'Đang tải lên',
      'Đang xử lý',
      'Sẵn sàng',
      'Bị từ chối',
      'Đã xoá',
    ]);
    // UPLOADING/DELETED BE không trả → số tệp 0; READY 1.200.
    expect(within(rows[0]!).getAllByRole('cell')[1]?.textContent).toBe('0');
    expect(within(rows[2]!).getAllByRole('cell')[1]?.textContent).toBe('1.200');
  });

  it('"Giới hạn hiện hành" chỉ đọc, dựng từ capabilities (limits.upload.kinds)', async () => {
    signIn(['system-config:view']);
    renderTab();

    expect(await screen.findByText('Giới hạn hiện hành')).toBeInTheDocument();
    expect(await screen.findByText('JPEG')).toBeInTheDocument();
    expect(screen.getByText('PNG')).toBeInTheDocument();
    expect(screen.getByText('M4A')).toBeInTheDocument();
    expect(screen.getByText('20 MB')).toBeInTheDocument();
    expect(screen.getByText('10 MB · 300 giây')).toBeInTheDocument();
    expect(screen.getByText('60 giây')).toBeInTheDocument();
  });

  it('manager (chỉ system-config:view) KHÔNG thấy nút dọn tệp mồ côi', async () => {
    signIn(['system-config:view']);
    renderTab();

    await screen.findByText('Tổng dung lượng');
    expect(
      screen.queryByRole('button', { name: /Chạy dọn tệp mồ côi ngay/ }),
    ).not.toBeInTheDocument();
  });

  it('có system-config:update thì thấy nút dọn tệp mồ côi', async () => {
    signIn(['system-config:view', 'system-config:update']);
    renderTab();

    expect(
      await screen.findByRole('button', { name: /Chạy dọn tệp mồ côi ngay/ }),
    ).toBeInTheDocument();
  });

  it('thiếu workspace:view thì ẩn bộ lọc workspace (không gọi /admin/workspaces)', async () => {
    signIn(['system-config:view']);
    renderTab();

    await screen.findByText('Tổng dung lượng');
    expect(screen.queryByRole('button', { name: /Toàn hệ thống/ })).not.toBeInTheDocument();
    expect(workspaceQueries).toHaveLength(0);
  });

  it('lọc workspace: tìm không dấu ("cong") ra "Công ty Alpha", chọn xong gọi stats kèm workspaceId', async () => {
    signIn(['system-config:view', 'workspace:view']);
    renderTab();
    const user = userEvent.setup();

    await screen.findByText('Tổng dung lượng');
    expect(statsQueries).toEqual([null]);

    await user.click(screen.getByRole('button', { name: /Toàn hệ thống/ }));
    await user.type(await screen.findByPlaceholderText('Tìm workspace theo tên…'), 'cong');

    // Danh sách gợi ý lúc mở (chưa có từ khoá) hiện cả hai; sau debounce chỉ còn kết quả khớp "cong".
    await waitFor(
      () => expect(screen.queryByRole('button', { name: 'Nhóm Beta' })).not.toBeInTheDocument(),
      {
        timeout: 3000,
      },
    );
    expect(workspaceQueries).toContain('cong');
    await user.click(screen.getByRole('button', { name: 'Công ty Alpha' }));

    await waitFor(() => expect(statsQueries).toContain(WS_ID));
    // Số liệu của workspace (42 tệp) thay cho toàn hệ thống.
    await waitFor(() => expect(screen.getAllByText('42').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: /Công ty Alpha/ })).toBeInTheDocument();
  });

  it('workspace trên URL có id sai định dạng → bỏ qua, gọi stats toàn hệ thống', async () => {
    signIn(['system-config:view', 'workspace:view']);
    renderTab('/system-config?tab=storage&storageWs=khong-phai-objectid');

    await screen.findByText('Tổng dung lượng');
    expect(statsQueries).toEqual([null]);
  });

  it('workspace trên URL hợp lệ → gọi stats kèm workspaceId và hiện tên đã lưu trên URL', async () => {
    signIn(['system-config:view', 'workspace:view']);
    renderTab(
      `/system-config?tab=storage&storageWs=${WS_ID}&storageWsName=${encodeURIComponent('Công ty Alpha')}`,
    );

    expect(await screen.findByRole('button', { name: /Công ty Alpha/ })).toBeInTheDocument();
    await waitFor(() => expect(statsQueries).toEqual([WS_ID]));
  });

  it('BE lỗi → thông báo lỗi kèm nút "Thử lại"', async () => {
    signIn(['system-config:view']);
    server.use(
      http.get('*/admin/storage/stats', () =>
        HttpResponse.json(
          { success: false, error: { code: 'SYS_500', message: 'Lỗi hệ thống' } },
          { status: 500 },
        ),
      ),
    );
    renderTab();

    expect(await screen.findByText('Không tải được số liệu lưu trữ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});
