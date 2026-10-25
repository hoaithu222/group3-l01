import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { AxiosRequestConfig } from 'axios';

import { apiClient } from '@/core/api/client';
import { showToast } from '@/shared/utils/toast.utils';

import type { ScopeReportDetail, ScopeReportItem } from '../api/moderation.types';
import { ScopeReportsScreen } from '../screens/ScopeReportsScreen';
import { apiError, envelope, renderWithProviders } from './test-utils';

/**
 * Hàng đợi phạm vi (p1-08 #9, MOD-03/MOD-04 mức màn hình): lọc theo trạng thái, không có preview khi BE không trả,
 * hành động theo `myActions`, và xử lý bắt buộc lý do ≥ 10 ký tự — gọi ĐÚNG `POST /reports/:id/resolve`.
 */

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/core/api/client', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@shopify/flash-list', () => ({ FlashList: jest.requireActual('react-native').FlatList }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const get = jest.mocked(apiClient.get);
const post = jest.mocked(apiClient.post);
const META = { nextCursor: null, hasMore: false, limit: 20 };
const WS = { type: 'WORKSPACE', id: 'ws-1' } as const;

const ITEM: ScopeReportItem = {
  reportId: 'r-1', groupKey: 'MESSAGE:m-1', targetType: 'MESSAGE', targetId: 'm-1',
  reportCount: 3, reasons: ['SPAM', 'HARASSMENT'], latestAt: '2026-09-19T00:00:00.000Z', status: 'OPEN', resolution: null,
  scope: { type: 'CHANNEL', id: 'ch-1', name: 'chung' },
  preview: { authorName: 'An', excerpt: 'mua ngay @{u:507f1f77bcf86cd799439011} nhé', deleted: false },
};

const DETAIL: ScopeReportDetail = { ...ITEM, myActions: { canRemove: true, canDismiss: true, canWarn: true } };

/** Định tuyến `GET` theo URL — hàng đợi (theo `status`) và chi tiết. */
function mockServer(queueByStatus: Partial<Record<string, ScopeReportItem[]>>, detail: ScopeReportDetail = DETAIL) {
  get.mockImplementation((url: string, config?: AxiosRequestConfig) => {
    if (url.startsWith('/reports/')) return Promise.resolve(envelope(detail));
    const status = (config?.params as { status?: string } | undefined)?.status ?? 'OPEN';
    return Promise.resolve(envelope(queueByStatus[status] ?? [], META));
  });
}

const REASON = 'Nội dung quảng cáo lặp lại nhiều lần';

describe('ScopeReportsScreen — hàng đợi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mặc định tab "Đang mở": gọi GET /workspaces/:id/reports?status=OPEN; hàng hiện loại đích + kênh + số báo cáo + lý do, KHÔNG in marker nhắc tên thô', async () => {
    mockServer({ OPEN: [ITEM] });
    await renderWithProviders(<ScopeReportsScreen scope={WS} />);

    expect(await screen.findByText('Tin nhắn · chung')).toBeOnTheScreen();
    expect(screen.getByText('3 báo cáo')).toBeOnTheScreen();
    expect(screen.getByText(/Spam, Quấy rối/)).toBeOnTheScreen();
    expect(screen.getByText('An: mua ngay @… nhé')).toBeOnTheScreen();
    expect(get).toHaveBeenCalledWith('/workspaces/ws-1/reports', {
      params: { status: 'OPEN', cursor: undefined, limit: 20 },
      skipErrorToast: true,
    });
  });

  it('không có `preview` (không đọc được phạm vi) ⇒ chỉ metadata, không bịa nội dung', async () => {
    mockServer({ OPEN: [{ ...ITEM, preview: undefined }] });
    await renderWithProviders(<ScopeReportsScreen scope={WS} />);

    expect(await screen.findByText('Tin nhắn · chung')).toBeOnTheScreen();
    expect(screen.queryByText(/mua ngay/)).toBeNull();
  });

  it('đổi tab ⇒ gửi đúng status: Đã xử lý = RESOLVED, Đã bỏ qua = DISMISSED', async () => {
    mockServer({ OPEN: [ITEM], RESOLVED: [{ ...ITEM, status: 'RESOLVED', resolution: 'CONTENT_REMOVED' }], DISMISSED: [] });
    await renderWithProviders(<ScopeReportsScreen scope={WS} />);
    await screen.findByText('Tin nhắn · chung');

    await fireEvent.press(screen.getByText('Đã xử lý'));
    expect(await screen.findByText('Đã gỡ nội dung')).toBeOnTheScreen();
    expect(get).toHaveBeenCalledWith('/workspaces/ws-1/reports', expect.objectContaining({ params: expect.objectContaining({ status: 'RESOLVED' }) }));

    await fireEvent.press(screen.getByText('Đã bỏ qua'));
    expect(await screen.findByText('Chưa có báo cáo nào bị bỏ qua')).toBeOnTheScreen();
    expect(get).toHaveBeenCalledWith('/workspaces/ws-1/reports', expect.objectContaining({ params: expect.objectContaining({ status: 'DISMISSED' }) }));
  });

  it('phạm vi nhóm chat ⇒ GET /conversations/:id/reports', async () => {
    mockServer({ OPEN: [] });
    await renderWithProviders(<ScopeReportsScreen scope={{ type: 'CONVERSATION', id: 'cv-1' }} />);

    expect(await screen.findByText('Không có báo cáo nào cần xử lý')).toBeOnTheScreen();
    expect(get).toHaveBeenCalledWith('/conversations/cv-1/reports', expect.anything());
  });

  it('403 PERM_001 (không phải người kiểm duyệt) ⇒ báo rõ + nút Quay lại, không hiện tab hay nút thử lại', async () => {
    get.mockRejectedValue(apiError(403, 'PERM_001'));
    await renderWithProviders(<ScopeReportsScreen scope={WS} />);

    expect(await screen.findByText('Không có quyền xem')).toBeOnTheScreen();
    expect(screen.getByText('Quay lại')).toBeOnTheScreen();
    expect(screen.queryByText('Đang mở')).toBeNull();
    expect(screen.queryByText('Thử lại')).toBeNull();
  });

  it('lỗi mạng/máy chủ ⇒ "Không tải được" + Thử lại (khác 403)', async () => {
    get.mockRejectedValue(apiError(500, 'SRV_001'));
    await renderWithProviders(<ScopeReportsScreen scope={WS} />);

    expect(await screen.findByText('Không tải được')).toBeOnTheScreen();
    expect(screen.getByText('Thử lại')).toBeOnTheScreen();
  });
});

describe('ScopeReportsScreen — xử lý báo cáo', () => {
  beforeEach(() => jest.clearAllMocks());

  async function openDetail(detail: ScopeReportDetail = DETAIL) {
    mockServer({ OPEN: [ITEM] }, detail);
    await renderWithProviders(<ScopeReportsScreen scope={WS} />);
    await fireEvent.press(await screen.findByText('Tin nhắn · chung'));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/reports/r-1', { skipErrorToast: true }));
  }

  it('hành động hiện THEO `myActions` của BE — không có canRemove/canWarn thì không có nút Gỡ tin/Cảnh cáo', async () => {
    await openDetail({ ...DETAIL, myActions: { canRemove: false, canDismiss: true, canWarn: false } });

    expect(await screen.findByText('Bỏ qua báo cáo')).toBeOnTheScreen();
    expect(screen.queryByText('Gỡ tin nhắn')).toBeNull();
    expect(screen.queryByText('Cảnh cáo tác giả')).toBeNull();
  });

  it('Gỡ tin: lý do < 10 ký tự ⇒ nút xác nhận khoá; đủ ⇒ POST /reports/:id/resolve { action, reason đã cắt }', async () => {
    post.mockResolvedValue(envelope({ groupKey: 'MESSAGE:m-1', status: 'RESOLVED', resolution: 'CONTENT_REMOVED', closedCount: 3 }));
    await openDetail();

    await fireEvent.press(await screen.findByText('Gỡ tin nhắn'));
    expect(await screen.findByText('Gỡ tin nhắn này?')).toBeOnTheScreen();
    expect(screen.getByText(/Tin sẽ hiện là đã bị gỡ với mọi người/)).toBeOnTheScreen();
    const confirm = () => screen.getByRole('button', { name: 'Gỡ tin nhắn' });
    expect(confirm()).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText(/Lý do/), 'ngắn quá');
    expect(confirm()).toBeDisabled();
    expect(screen.getByText('Lý do tối thiểu 10 ký tự')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText(/Lý do/), `  ${REASON}  `);
    expect(confirm()).toBeEnabled();
    await fireEvent.press(confirm());

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/reports/r-1/resolve', { action: 'REMOVE_MESSAGE', reason: REASON }, { skipErrorToast: true });
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('success', 'Đã xử lý báo cáo'));
  });

  it('Cảnh cáo tác giả dùng mã WARN_AUTHOR', async () => {
    post.mockResolvedValue(envelope({ groupKey: 'MESSAGE:m-1', status: 'RESOLVED', resolution: 'AUTHOR_WARNED', closedCount: 3 }));
    await openDetail();

    await fireEvent.press(await screen.findByText('Cảnh cáo tác giả'));
    await fireEvent.changeText(await screen.findByLabelText(/Lý do/), REASON);
    await fireEvent.press(screen.getByRole('button', { name: 'Cảnh cáo' }));
    await waitFor(() => expect(post).toHaveBeenLastCalledWith('/reports/r-1/resolve', { action: 'WARN_AUTHOR', reason: REASON }, { skipErrorToast: true }));
  });

  it('Bỏ qua báo cáo dùng mã DISMISS', async () => {
    post.mockResolvedValue(envelope({ groupKey: 'MESSAGE:m-1', status: 'DISMISSED', resolution: 'NO_ACTION', closedCount: 3 }));
    await openDetail();

    await fireEvent.press(await screen.findByText('Bỏ qua báo cáo'));
    await fireEvent.changeText(await screen.findByLabelText(/Lý do/), REASON);
    await fireEvent.press(screen.getByRole('button', { name: 'Bỏ qua' }));
    await waitFor(() => expect(post).toHaveBeenLastCalledWith('/reports/r-1/resolve', { action: 'DISMISS', reason: REASON }, { skipErrorToast: true }));
  });

  it('MOD_001 (người khác đã xử lý trước) ⇒ báo nhẹ + đóng tấm + làm mới hàng đợi, không hiện như lỗi của mình', async () => {
    post.mockRejectedValue(apiError(409, 'MOD_001'));
    await openDetail();
    await fireEvent.press(await screen.findByText('Gỡ tin nhắn'));
    await fireEvent.changeText(await screen.findByLabelText(/Lý do/), REASON);
    get.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: 'Gỡ tin nhắn' }));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('info', 'Báo cáo đã được xử lý bởi người khác. Danh sách sẽ được làm mới.'),
    );
    await waitFor(() => expect(get).toHaveBeenCalledWith('/workspaces/ws-1/reports', expect.anything()));
  });

  it('lỗi khác (MOD_003) ⇒ hiện TRONG tấm, giữ nguyên lý do đã gõ', async () => {
    post.mockRejectedValue(apiError(400, 'MOD_003'));
    await openDetail();
    await fireEvent.press(await screen.findByText('Gỡ tin nhắn'));
    await fireEvent.changeText(await screen.findByLabelText(/Lý do/), REASON);
    await fireEvent.press(screen.getByRole('button', { name: 'Gỡ tin nhắn' }));

    expect(await screen.findByText('Không thể thực hiện thao tác này với loại báo cáo này')).toBeOnTheScreen();
    expect(screen.getByDisplayValue(REASON)).toBeOnTheScreen();
  });
});
