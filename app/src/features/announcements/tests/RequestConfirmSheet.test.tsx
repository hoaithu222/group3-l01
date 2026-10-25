import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useConnectionState } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';

import { announcementKeys } from '../api/announcements.keys';
import { announcementsService } from '../api/announcements.service';
import type { AnnouncementView } from '../api/announcements.types';
import { RequestConfirmSheet } from '../components/RequestConfirmSheet';
import { apiError, flushQuery, makeQueryClient, makeView, renderWithProviders } from './fixtures';

/**
 * Tấm "Yêu cầu xác nhận đã đọc" (app.md p5-04 §3): 5 mốc hạn (mặc định KHÔNG hạn), gửi `POST /messages/:id/announcement`, lỗi
 * `ANN_001`/`ANN_002`/`CH_004` hiện nhãn riêng và tấm Ở LẠI, mất mạng → nút khoá "Kết nối lại để gửi".
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: jest.fn(),
}));
jest.mock('../api/announcements.service', () => ({ announcementsService: { create: jest.fn() } }));

const mockedCreate = jest.mocked(announcementsService.create);
const mockedConnection = jest.mocked(useConnectionState);
const mockedToast = jest.mocked(showToast);
const KEY = announcementKeys.channel('ch-1');

async function renderSheet(messageId: string | null = 'm-1') {
  const onClose = jest.fn();
  const queryClient = makeQueryClient();
  await renderWithProviders(
    <RequestConfirmSheet channelId="ch-1" messageId={messageId} visible onClose={onClose} />,
    queryClient,
  );
  return { onClose, queryClient };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedConnection.mockReturnValue('connected');
  mockedCreate.mockResolvedValue(makeView());
});

describe('RequestConfirmSheet — chọn hạn', () => {
  it('có tiêu đề, mô tả và 5 mốc hạn; mặc định chọn "Không đặt hạn"', async () => {
    await renderSheet();

    expect(screen.getByText('Yêu cầu xác nhận đã đọc')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Không đặt hạn' })).toBeChecked();
    for (const label of ['24 giờ', '3 ngày', '7 ngày', '14 ngày']) {
      expect(screen.getByRole('radio', { name: label })).not.toBeChecked();
    }
  });

  it('gửi mặc định → KHÔNG gửi `deadlineAt` (yêu cầu không hạn)', async () => {
    const { onClose } = await renderSheet();

    await fireEvent.press(screen.getByText('Gửi yêu cầu'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await flushQuery();
    expect(mockedCreate).toHaveBeenCalledWith({ deadlineAt: undefined, messageId: 'm-1' });
  });

  it('chọn "3 ngày" → mốc đó được chọn (một mốc tại một thời điểm) và gửi `deadlineAt` ≈ bây giờ + 72 giờ', async () => {
    const { onClose } = await renderSheet();
    const before = Date.now();

    await fireEvent.press(screen.getByText('3 ngày'));
    expect(screen.getByRole('radio', { name: '3 ngày' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Không đặt hạn' })).not.toBeChecked();
    await fireEvent.press(screen.getByText('Gửi yêu cầu'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await flushQuery();
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    const deadline = Date.parse(mockedCreate.mock.calls[0]![0].deadlineAt!);
    expect(deadline).toBeGreaterThanOrEqual(before + 72 * 3_600_000);
    expect(deadline).toBeLessThan(Date.now() + 72 * 3_600_000 + 5_000);
  });
});

describe('RequestConfirmSheet — kết quả', () => {
  it('thành công → chèn view vào cache (huy hiệu hiện ngay), toast, đóng tấm', async () => {
    const created = makeView({ canViewReceipts: true, confirmedCount: 0 });
    mockedCreate.mockResolvedValue(created);
    const { onClose, queryClient } = await renderSheet();
    // Lượt tải lại sau khi gửi không có bản chạy (không có observer bật) → cache giữ nguyên bản `onSuccess` chèn.

    await fireEvent.press(screen.getByText('Gửi yêu cầu'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await flushQuery();
    expect(queryClient.getQueryData<AnnouncementView[]>(KEY)).toContainEqual(created);
    expect(mockedToast).toHaveBeenCalledWith('success', 'Đã gửi yêu cầu xác nhận');
  });

  it.each([
    ['ANN_001', 400, 'Chỉ kênh thông báo mới yêu cầu xác nhận đã đọc'],
    ['ANN_002', 409, 'Kênh đang có quá nhiều thông báo cần xác nhận'],
    ['CH_004', 409, 'Kênh đã được lưu trữ, không thể thay đổi'],
  ])('%s → toast + lỗi "%s" TRONG tấm, tấm Ở LẠI để chọn lại', async (code, status, message) => {
    mockedCreate.mockRejectedValue(apiError(status, code));
    const { onClose } = await renderSheet();

    await fireEvent.press(screen.getByText('Gửi yêu cầu'));

    await waitFor(() => expect(mockedToast).toHaveBeenCalledWith('error', message));
    await flushQuery();
    expect(onClose).not.toHaveBeenCalled();
    // Toast nằm dưới cửa sổ `Modal` của tấm ⇒ lỗi phải đọc được ngay trong tấm (khe `alert`).
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen.getByText('Gửi yêu cầu')).toBeOnTheScreen();
  });
});

describe('RequestConfirmSheet — điều kiện gửi', () => {
  it('mất mạng → nút "Kết nối lại để gửi" bị khoá, không gọi API', async () => {
    mockedConnection.mockReturnValue('offline');
    await renderSheet();

    await fireEvent.press(screen.getByText('Kết nối lại để gửi'));

    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('không có tin đích (ý định đã xoá, tấm đang trượt xuống) → gửi không làm gì', async () => {
    await renderSheet(null);

    await fireEvent.press(screen.getByText('Gửi yêu cầu'));

    expect(mockedCreate).not.toHaveBeenCalled();
  });
});
