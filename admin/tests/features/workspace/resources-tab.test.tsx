/**
 * Tab `resources` (Tài liệu) của workspace (p3-01 admin.md §2.1, §4) — số liệu dung lượng + hạn mức
 * riêng. Mock ở tầng HTTP (MSW) để đi đúng đường thật (axios interceptor, React Query).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import WorkspaceResourcesTab from '@/features/workspace/components/tabs/WorkspaceResourcesTab';

import {
  errorBody,
  GIB,
  okBody,
  renderWithQuery,
  RESOURCE_STATS,
  signIn,
} from './p3-fixtures';

interface QuotaBody {
  bytes?: number;
  reason: string;
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let statsCalls = 0;
let quotaBodies: QuotaBody[] = [];
let resetBodies: QuotaBody[] = [];

beforeEach(() => {
  statsCalls = 0;
  quotaBodies = [];
  resetBodies = [];
  // Không có `audit-log:view` ⇒ khối nhật ký chỉ hiện dòng chữ, không gọi API nhật ký.
  signIn(['workspace:view']);
});

function useStats(stats: unknown = RESOURCE_STATS) {
  server.use(
    http.get('*/admin/workspaces/:id/resource-stats', () => {
      statsCalls += 1;
      return okBody(stats);
    }),
    http.put('*/admin/workspaces/:id/resource-quota', async ({ request }) => {
      quotaBodies.push((await request.json()) as QuotaBody);
      return okBody({ quotaBytes: 3 * GIB });
    }),
    http.post('*/admin/workspaces/:id/resource-quota/reset', async ({ request }) => {
      resetBodies.push((await request.json()) as QuotaBody);
      return okBody({ quotaBytes: 2 * GIB });
    }),
  );
}

const renderTab = () => renderWithQuery(<WorkspaceResourcesTab workspaceId="ws-1" />);

describe('WorkspaceResourcesTab — số liệu', () => {
  it('hiện dung lượng đã dùng / hạn mức, %, số tệp, số thư mục, thùng rác và bảng theo loại', async () => {
    useStats();
    renderTab();

    expect(await screen.findByText('Dung lượng kho tài liệu')).toBeInTheDocument();
    expect(screen.getByText(/1\.5 GB \/ 2 GB/)).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByText('Hạn mức mặc định')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument(); // số tệp
    expect(screen.getByText('14')).toBeInTheDocument(); // số thư mục
    expect(screen.getByText('200 MB')).toBeInTheDocument(); // thùng rác

    // Bảng theo loại: chỉ ba cột loại · số tệp · dung lượng, hàng lớn nhất xếp trước.
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Loại',
      'Số tệp',
      'Dung lượng',
    ]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('PDF');
    expect(rows[1]).toHaveTextContent('Ảnh');
    expect(rows[2]).toHaveTextContent('Mã nguồn');
    expect(statsCalls).toBe(1);
  });

  it('hạn mức riêng: nhãn "Hạn mức riêng" thay cho mặc định', async () => {
    useStats({ ...RESOURCE_STATS, quotaSource: 'OVERRIDE', quotaBytes: 5 * GIB });
    renderTab();

    expect((await screen.findAllByText('Hạn mức riêng')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Hạn mức mặc định')).not.toBeInTheDocument();
    expect(screen.getByText(/1\.5 GB \/ 5 GB/)).toBeInTheDocument();
  });

  it('cờ project tắt giữa chừng (404 CFG_005): "Kho tài liệu đang tắt", KHÔNG phải lỗi', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/resource-stats', () =>
        errorBody(404, 'CFG_005', 'Tính năng chưa được bật'),
      ),
    );
    renderTab();

    expect(await screen.findByText('Kho tài liệu đang tắt')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được số liệu tài liệu')).not.toBeInTheDocument();
  });

  it('lỗi máy chủ: báo lỗi có "Thử lại", bấm là tải lại thành công', async () => {
    let calls = 0;
    server.use(
      http.get('*/admin/workspaces/:id/resource-stats', () => {
        calls += 1;
        return calls === 1 ? errorBody(500, 'SYS_500', 'Lỗi hệ thống') : okBody(RESOURCE_STATS);
      }),
    );
    renderTab();

    expect(await screen.findByText('Không tải được số liệu tài liệu')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Dung lượng kho tài liệu')).toBeInTheDocument();
  });

  it('thiếu quyền (403): báo không có quyền, KHÔNG có "Thử lại"', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/resource-stats', () =>
        errorBody(403, 'AUTH_005', 'Không có quyền'),
      ),
    );
    renderTab();

    expect(await screen.findByText('Không tải được số liệu tài liệu')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản của bạn không có quyền xem mục này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });
});

describe('WorkspaceResourcesTab — quyền sửa hạn mức', () => {
  it('thiếu system-config:update (vai manager chỉ xem) ⇒ KHÔNG có nút đặt hạn mức / về mặc định', async () => {
    useStats({ ...RESOURCE_STATS, quotaSource: 'OVERRIDE' });
    renderTab();

    await screen.findByText('Dung lượng kho tài liệu');
    expect(screen.queryByRole('button', { name: 'Đặt hạn mức riêng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Về mặc định' })).not.toBeInTheDocument();
    expect(screen.getByText(/Chỉ tài khoản có quyền sửa cấu hình hệ thống/)).toBeInTheDocument();
  });

  it('có system-config:update ⇒ có "Đặt hạn mức riêng"; "Về mặc định" chỉ khi đang ghi đè', async () => {
    signIn(['workspace:view', 'system-config:update']);
    useStats();
    const { unmount } = renderTab();

    expect(await screen.findByRole('button', { name: 'Đặt hạn mức riêng' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Về mặc định' })).not.toBeInTheDocument();
    unmount();

    useStats({ ...RESOURCE_STATS, quotaSource: 'OVERRIDE' });
    renderTab();
    expect(await screen.findByRole('button', { name: 'Về mặc định' })).toBeInTheDocument();
  });
});

describe('ResourceQuotaModal — đặt hạn mức riêng', () => {
  beforeEach(() => signIn(['workspace:view', 'system-config:update']));

  async function openModal() {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Đặt hạn mức riêng' }));
    return user;
  }

  it('gợi ý khoảng hạn mức theo định dạng vi-VN: "Từ 0,5 đến 100 GiB" (không phải 0.5 hay làm tròn 1)', async () => {
    useStats();
    renderTab();
    await openModal();

    expect(await screen.findByText('Từ 0,5 đến 100 GiB')).toBeInTheDocument();
  });

  it('lý do < 10 ký tự ⇒ chặn gửi, hiện lỗi tại ô, không gọi API', async () => {
    useStats();
    renderTab();
    const user = await openModal();

    await user.type(await screen.findByLabelText(/Lý do/), 'ngắn');
    await user.click(screen.getByRole('button', { name: 'Đặt hạn mức' }));

    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(quotaBodies).toHaveLength(0);
  });

  it('bỏ trống hạn mức ⇒ chặn gửi, không gọi API', async () => {
    useStats();
    renderTab();
    const user = await openModal();

    await user.clear(await screen.findByLabelText(/Hạn mức \(GiB\)/));
    await user.type(screen.getByLabelText(/Lý do/), 'Nhóm cần thêm dung lượng');
    await user.click(screen.getByRole('button', { name: 'Đặt hạn mức' }));

    expect(await screen.findByText('Nhập hạn mức (GiB)')).toBeInTheDocument();
    expect(quotaBodies).toHaveLength(0);
  });

  it('hợp lệ ⇒ PUT { bytes (GiB → byte), reason } rồi đóng modal và tải lại số liệu', async () => {
    useStats();
    renderTab();
    const user = await openModal();

    const gib = await screen.findByLabelText(/Hạn mức \(GiB\)/);
    expect(gib).toHaveValue('2'); // khởi tạo bằng hạn mức hiện hành (2 GiB)
    await user.clear(gib);
    await user.type(gib, '3');
    await user.type(screen.getByLabelText(/Lý do/), 'Nhóm đồ án cần thêm dung lượng');
    await user.click(screen.getByRole('button', { name: 'Đặt hạn mức' }));

    await waitFor(() => expect(quotaBodies).toHaveLength(1));
    expect(quotaBodies[0]).toEqual({ bytes: 3 * GIB, reason: 'Nhóm đồ án cần thêm dung lượng' });
    await waitFor(() => expect(screen.queryByLabelText(/Lý do/)).not.toBeInTheDocument());
    await waitFor(() => expect(statsCalls).toBeGreaterThanOrEqual(2)); // invalidate → tải lại
  });

  it('409 RES_003 (người khác vừa đổi) ⇒ banner "Tải lại", giữ modal và lý do; tải lại nạp hạn mức mới', async () => {
    let getCalls = 0;
    server.use(
      http.get('*/admin/workspaces/:id/resource-stats', () => {
        getCalls += 1;
        // Lần đầu 2 GiB; sau "Tải lại" hạn mức đã bị người khác đổi thành 7 GiB.
        return okBody({ ...RESOURCE_STATS, quotaBytes: getCalls === 1 ? 2 * GIB : 7 * GIB });
      }),
      http.put('*/admin/workspaces/:id/resource-quota', () =>
        errorBody(409, 'RES_003', 'Dữ liệu đã thay đổi'),
      ),
    );
    renderTab();
    const user = await openModal();

    await user.type(await screen.findByLabelText(/Lý do/), 'Nhóm đồ án cần thêm dung lượng');
    await user.click(screen.getByRole('button', { name: 'Đặt hạn mức' }));

    expect(await screen.findByText('Hạn mức vừa được người khác thay đổi')).toBeInTheDocument();
    // Modal còn mở, lý do còn nguyên.
    expect(screen.getByLabelText(/Lý do/)).toHaveValue('Nhóm đồ án cần thêm dung lượng');

    await user.click(screen.getByRole('button', { name: 'Tải lại' }));
    await waitFor(() => expect(screen.getByLabelText(/Hạn mức \(GiB\)/)).toHaveValue('7'));
    expect(screen.queryByText('Hạn mức vừa được người khác thay đổi')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Lý do/)).toHaveValue('Nhóm đồ án cần thêm dung lượng');
  });
});

describe('ResourceQuotaPanel — về mặc định', () => {
  it('cần lý do ≥ 10 ký tự rồi POST /resource-quota/reset { reason }', async () => {
    signIn(['workspace:view', 'system-config:update']);
    useStats({ ...RESOURCE_STATS, quotaSource: 'OVERRIDE', quotaBytes: 5 * GIB });
    renderTab();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Về mặc định' }));
    const dialog = await screen.findByRole('dialog');
    // Nút xác nhận nằm TRONG hộp thoại (nút cùng tên ở ngoài bị Radix ẩn khi hộp thoại mở).
    const confirm = () => within(dialog).getByRole('button', { name: 'Về mặc định' });

    await user.type(within(dialog).getByLabelText(/Lý do/), 'ngắn');
    await user.click(confirm());
    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(resetBodies).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText(/Lý do/));
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Hết đợt cần dung lượng riêng');
    await user.click(confirm());

    await waitFor(() => expect(resetBodies).toHaveLength(1));
    expect(resetBodies[0]).toEqual({ reason: 'Hết đợt cần dung lượng riêng' });
  });
});
