/**
 * Tab `wallet` của workspace (p6-04 admin.md §2.1, §4) — CHỈ đọc, số liệu tổng
 * hợp ẩn danh. Mock ở tầng HTTP (MSW), không mock service/queries, để bài kiểm đi
 * đúng đường thật (axios interceptor, unwrap `ApiResponse`).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import WorkspaceWalletTab from '@/features/workspace/components/tabs/WorkspaceWalletTab';

import { errorBody, makeStats, okBody, renderWithQuery, WALLET_STATS } from './wallet-tab-fixtures';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const renderTab = () => renderWithQuery(<WorkspaceWalletTab workspaceId="ws-1" />);

describe('WorkspaceWalletTab — trạng thái tải', () => {
  it('gọi đúng endpoint wallet-stats của workspace', async () => {
    const paths: string[] = [];
    server.use(
      http.get('*/admin/workspaces/:id/wallet-stats', ({ request }) => {
        paths.push(new URL(request.url).pathname);
        return okBody(WALLET_STATS);
      }),
    );
    renderTab();

    await screen.findByText('Trạng thái');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/\/admin\/workspaces\/ws-1\/wallet-stats$/);
  });

  it('đang tải: hiện khung chờ (aria-busy), chưa có số liệu', async () => {
    server.use(http.get('*/admin/workspaces/:id/wallet-stats', () => okBody(WALLET_STATS)));
    renderTab();

    expect(screen.getByRole('status', { name: 'Đang tải thống kê ví' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByText('Số liệu 30 ngày')).not.toBeInTheDocument();

    await screen.findByText('Số liệu 30 ngày');
    expect(screen.queryByRole('status', { name: 'Đang tải thống kê ví' })).not.toBeInTheDocument();
  });

  it('lỗi máy chủ: báo lỗi có nút "Thử lại", bấm là tải lại thành công', async () => {
    let calls = 0;
    server.use(
      http.get('*/admin/workspaces/:id/wallet-stats', () => {
        calls += 1;
        return calls === 1 ? errorBody(500, 'INTERNAL_ERROR', 'Lỗi hệ thống') : okBody(WALLET_STATS);
      }),
    );
    renderTab();

    expect(await screen.findByText('Không tải được thống kê ví')).toBeInTheDocument();
    expect(screen.queryByText('Số liệu 30 ngày')).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Số liệu 30 ngày')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được thống kê ví')).not.toBeInTheDocument();
  });

  it('cờ wallet tắt giữa chừng (404 CFG_005): hiện "Ví nhóm đang tắt", KHÔNG phải lỗi', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/wallet-stats', () =>
        errorBody(404, 'CFG_005', 'Tính năng chưa được bật'),
      ),
    );
    renderTab();

    expect(await screen.findByText('Ví nhóm đang tắt')).toBeInTheDocument();
    expect(screen.queryByText('Không tải được thống kê ví')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  // Bản cũ khẳng định "vẫn là lỗi có thể thử lại" — sai: 404 (workspace không còn) thì bấm "Thử lại" bao nhiêu lần cũng
  // vẫn 404. Nay 403/404 là "không có/không được xem" (không nút), chỉ lỗi tạm thời (5xx, mất mạng) mới có "Thử lại".
  it('workspace không tồn tại (404 khác CFG_005): báo dữ liệu không còn, KHÔNG có nút "Thử lại"', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/wallet-stats', () =>
        errorBody(404, 'WORKSPACE_001', 'Không tìm thấy workspace'),
      ),
    );
    renderTab();

    expect(await screen.findByText('Không tải được thống kê ví')).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu này không còn tồn tại hoặc đã bị gỡ.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('thiếu quyền (403): báo không có quyền xem, KHÔNG có nút "Thử lại"', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/wallet-stats', () =>
        errorBody(403, 'AUTH_005', 'Không có quyền'),
      ),
    );
    renderTab();

    expect(await screen.findByText('Không tải được thống kê ví')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản của bạn không có quyền xem mục này.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });
});

describe('WorkspaceWalletTab — nội dung', () => {
  it('khối Trạng thái: ví/nhắc bật, lịch nhắc in nguyên văn từ server', async () => {
    server.use(http.get('*/admin/workspaces/:id/wallet-stats', () => okBody(WALLET_STATS)));
    renderTab();

    expect(await screen.findByText('Trạng thái')).toBeInTheDocument();
    expect(screen.getByText('Thứ Sáu 09:00 Asia/Ho_Chi_Minh')).toBeInTheDocument();
    expect(screen.getAllByText('Đang bật')).toHaveLength(2);
  });

  it('ví tắt + nhắc tắt: hai badge "Đang tắt"; thiếu lịch → "—"', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/wallet-stats', () =>
        okBody(makeStats({ enabled: false, reminder: { enabled: false, cronText: '', targetType: 'NONE', targetChannelName: null } })),
      ),
    );
    renderTab();

    await screen.findByText('Trạng thái');
    expect(screen.getAllByText('Đang tắt')).toHaveLength(2);
    expect(screen.queryByText('Đang bật')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Không đăng')).toBeInTheDocument();
  });

  it('khối Số liệu 30 ngày: bốn thẻ đếm đúng nhãn và giá trị', async () => {
    server.use(http.get('*/admin/workspaces/:id/wallet-stats', () => okBody(WALLET_STATS)));
    renderTab();

    await screen.findByText('Số liệu 30 ngày');
    const cards: ReadonlyArray<readonly [string, string]> = [
      ['Số khoản chi', '12'],
      ['Trả nợ đã xác nhận', '7'],
      ['Chờ xác nhận quá 48 giờ', '2'],
      ['Người đang nợ', '5'],
    ];
    for (const [label, value] of cards) {
      // Giá trị nằm ở thẻ <p> ngay sau nhãn; khớp NGUYÊN CHỮ (`2` không khớp `20`).
      const valueEl = screen.getByText(label).nextElementSibling as HTMLElement;
      expect(within(valueEl).getAllByText(value).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Chỉ đếm số người')).toBeInTheDocument();
  });

  it.each([
    ['LT_500K', '< 500 nghìn ₫'],
    ['500K_2M', '500 nghìn – 2 triệu ₫'],
    ['2M_10M', '2 – 10 triệu ₫'],
    ['GT_10M', '> 10 triệu ₫'],
  ] as const)('khối Khoảng giá trị: dải %s hiện nhãn "%s" và không hiện nhãn dải khác', async (band, label) => {
    server.use(
      http.get('*/admin/workspaces/:id/wallet-stats', () =>
        okBody(makeStats({ last30d: { spendBand: band } })),
      ),
    );
    renderTab();

    expect(await screen.findByText(label)).toBeInTheDocument();
    for (const other of ['< 500 nghìn ₫', '500 nghìn – 2 triệu ₫', '2 – 10 triệu ₫', '> 10 triệu ₫']) {
      if (other !== label) expect(screen.queryByText(other)).not.toBeInTheDocument();
    }
  });

  it('chưa có khoản chi nào: hiện trạng thái rỗng, KHÔNG in dải thấp nhất', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/wallet-stats', () =>
        okBody(makeStats({ last30d: { expensesCount: 0, spendBand: 'LT_500K' } })),
      ),
    );
    renderTab();

    expect(await screen.findByText('Chưa có khoản chi trong 30 ngày')).toBeInTheDocument();
    expect(screen.queryByText('< 500 nghìn ₫')).not.toBeInTheDocument();
  });
});

describe('WorkspaceWalletTab — nơi đăng nhắc (riêng tư)', () => {
  it('đích là nhóm chat ⇒ chỉ hiện "Nhóm chat", KHÔNG tên — kể cả khi BE lỡ gửi kèm tên', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/wallet-stats', () =>
        okBody(
          makeStats({
            reminder: { targetType: 'CONVERSATION', targetChannelName: 'Nhóm kín của phòng Kế toán' },
          }),
        ),
      ),
    );
    renderTab();

    expect(await screen.findByText('Nhóm chat')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Nhóm kín của phòng Kế toán');
  });

  it('đích là kênh công khai ⇒ hiện tên kênh', async () => {
    server.use(http.get('*/admin/workspaces/:id/wallet-stats', () => okBody(WALLET_STATS)));
    renderTab();

    expect(await screen.findByText('chi-tieu-chung')).toBeInTheDocument();
  });

  it('đích là kênh không có tên (riêng tư) ⇒ "Kênh riêng tư"', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/wallet-stats', () =>
        okBody(makeStats({ reminder: { targetType: 'CHANNEL', targetChannelName: null } })),
      ),
    );
    renderTab();

    expect(await screen.findByText('Kênh riêng tư')).toBeInTheDocument();
  });

  it('không đăng nhắc ⇒ "Không đăng"', async () => {
    server.use(
      http.get('*/admin/workspaces/:id/wallet-stats', () =>
        okBody(makeStats({ reminder: { targetType: 'NONE', targetChannelName: null } })),
      ),
    );
    renderTab();

    expect(await screen.findByText('Không đăng')).toBeInTheDocument();
  });
});

describe('WorkspaceWalletTab — không hành động', () => {
  it('sau khi tải xong không có nút, liên kết, bảng hay ô nhập nào', async () => {
    server.use(http.get('*/admin/workspaces/:id/wallet-stats', () => okBody(WALLET_STATS)));
    renderTab();
    await screen.findByText('Khoảng giá trị');

    await waitFor(() => {
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryAllByRole('table')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });
});
