import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useConnectionState } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';
import { serverNowMs } from '@/shell/store/slices/clock/clock.store';

import { scheduledMessageService } from '../api/scheduled-message.service';
import { ScheduledMessagesScreen } from '../screens/ScheduledMessagesScreen';
import { apiError, cursorPage, flushQuery, makeScheduled, renderWithProviders } from './fixtures';

/**
 * "Tin đã hẹn" (app.md §8): tab Lỗi hiện lý do tiếng Việt; Huỷ cần xác nhận; `SCHED_003` → làm mới danh sách; sửa giờ/gửi lại đi qua tấm chọn thời gian. Service mock; hành động của dòng
 * mở bằng menu "⋯" THẬT (`ActionMenu`) nên bấm hàng menu rồi chờ nó đóng xong mới chạy.
 */
const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
}));
jest.mock('@shopify/flash-list', () => ({ FlashList: jest.requireActual('react-native').FlatList }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/socket', () => ({ ...jest.requireActual('@/core/socket'), useConnectionState: jest.fn() }));
jest.mock('@/shell/store/slices/clock/clock.store', () => ({
  ...jest.requireActual('@/shell/store/slices/clock/clock.store'),
  serverNowMs: jest.fn(),
}));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }), useFeature: () => true }));
jest.mock('../api/scheduled-message.service', () => ({
  scheduledMessageService: { cancel: jest.fn(), create: jest.fn(), listMine: jest.fn(), sendNow: jest.fn(), update: jest.fn() },
}));

const service = jest.mocked(scheduledMessageService);
const NOW = new Date(2026, 8, 26, 21, 30, 0).getTime();
const PENDING_ROW = makeScheduled();
const FAILED_ROW = makeScheduled({ failReason: 'NO_PERMISSION', id: 's-2', status: 'FAILED' });

const openMenu = () => fireEvent.press(screen.getByLabelText(/^Tuỳ chọn cho tin hẹn giờ gửi/));
const pickMenu = async (label: string) => {
  await openMenu();
  await fireEvent.press(await screen.findByText(label));
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.current = {};
  jest.mocked(serverNowMs).mockReturnValue(NOW);
  jest.mocked(useConnectionState).mockReturnValue('connected');
  service.listMine.mockImplementation(async ({ status }) =>
    cursorPage(status === 'PENDING' ? [PENDING_ROW] : status === 'FAILED' ? [FAILED_ROW] : []),
  );
});

describe('ScheduledMessagesScreen — danh sách', () => {
  it('tab Đang chờ: nơi gửi, trích nội dung, giờ gửi (giờ máy) và trạng thái chữ', async () => {
    await renderWithProviders(<ScheduledMessagesScreen />);

    expect(await screen.findByText('Kênh Chung')).toBeOnTheScreen();
    expect(screen.getByText('Nhớ nộp báo cáo')).toBeOnTheScreen();
    expect(screen.getByText(/^Đang chờ gửi · \d{2}:\d{2} /)).toBeOnTheScreen();
    expect(service.listMine).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }));
    await flushQuery();
  });

  it('tab Lỗi hiện LÝ DO bằng tiếng Việt theo failReason (không lộ mã)', async () => {
    await renderWithProviders(<ScheduledMessagesScreen />);
    await screen.findByText('Kênh Chung');

    await fireEvent.press(screen.getByText('Lỗi'));

    expect(await screen.findByText('Bạn không còn quyền gửi tin ở đây')).toBeOnTheScreen();
    expect(screen.getByText(/^Không gửi được · /)).toBeOnTheScreen();
    expect(screen.queryByText('NO_PERMISSION')).toBeNull();
  });

  it('mở từ thông báo (`?id=`) → vào thẳng tab Lỗi; `?scopeType&scopeId` → lọc theo phòng', async () => {
    mockParams.current = { id: 's-2', scopeId: 'ch-1', scopeType: 'CHANNEL' };
    await renderWithProviders(<ScheduledMessagesScreen />);

    expect(await screen.findByText('Bạn không còn quyền gửi tin ở đây')).toBeOnTheScreen();
    expect(service.listMine).toHaveBeenCalledWith(expect.objectContaining({ scopeId: 'ch-1', scopeType: 'CHANNEL', status: 'FAILED' }));
  });

  it('rỗng theo từng tab; lỗi tải → Thử lại', async () => {
    service.listMine.mockResolvedValue(cursorPage([]));
    await renderWithProviders(<ScheduledMessagesScreen />);

    expect(await screen.findByText('Chưa có tin hẹn giờ')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Đã gửi'));
    expect(await screen.findByText('Chưa có tin nào đã gửi')).toBeOnTheScreen();

    service.listMine.mockRejectedValueOnce(apiError(500, 'SYS_500'));
    await fireEvent.press(screen.getByText('Lỗi'));
    expect(await screen.findByText('Thử lại')).toBeOnTheScreen();
  });

  it('ngoại tuyến → vẫn xem được (cache) nhưng KHÔNG có menu hành động', async () => {
    jest.mocked(useConnectionState).mockReturnValue('offline');
    await renderWithProviders(<ScheduledMessagesScreen />);

    expect(await screen.findByText('Kênh Chung')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Tuỳ chọn cho tin hẹn giờ gửi/)).toBeNull();
  });
});

describe('ScheduledMessagesScreen — hành động', () => {
  it('Huỷ CẦN XÁC NHẬN: chọn "Huỷ tin hẹn giờ" chưa gọi API; "Huỷ tin" mới gọi DELETE rồi tải lại', async () => {
    service.cancel.mockResolvedValue(undefined);
    await renderWithProviders(<ScheduledMessagesScreen />);
    await screen.findByText('Kênh Chung');

    await pickMenu('Huỷ tin hẹn giờ');
    expect(await screen.findByText('Huỷ tin hẹn giờ này?')).toBeOnTheScreen();
    expect(service.cancel).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Huỷ tin'));

    await waitFor(() => expect(service.cancel).toHaveBeenCalledWith('s-1'));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('success', 'Đã huỷ tin hẹn giờ'));
    await flushQuery();
  });

  it('SCHED_003 (tin đã gửi/huỷ ở nơi khác) → toast câu tiếng Việt + TẢI LẠI danh sách', async () => {
    service.sendNow.mockRejectedValue(apiError(409, 'SCHED_003'));
    await renderWithProviders(<ScheduledMessagesScreen />);
    await screen.findByText('Kênh Chung');
    const loadsBefore = service.listMine.mock.calls.length;

    await pickMenu('Gửi ngay');

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', 'Tin này đã được gửi hoặc đã huỷ nên không thể thay đổi'));
    await waitFor(() => expect(service.listMine.mock.calls.length).toBeGreaterThan(loadsBefore));
    await flushQuery();
  });

  it('Sửa giờ gửi → tấm chọn giờ → PATCH sendAt UTC kèm expectedVersion', async () => {
    service.update.mockResolvedValue(makeScheduled({ sendAt: new Date(NOW + 3_600_000).toISOString(), version: 2 }));
    await renderWithProviders(<ScheduledMessagesScreen />);
    await screen.findByText('Kênh Chung');

    await pickMenu('Sửa giờ gửi');
    await fireEvent.press(await screen.findByText('Lưu giờ gửi'));

    await waitFor(() => expect(service.update).toHaveBeenCalledWith('s-1', expect.objectContaining({ expectedVersion: 1, sendAt: new Date(NOW + 3_600_000).toISOString() })));
    await flushQuery();
  });

  it('tin có nhắc tên KHÔNG có "Sửa nội dung" (chỉ sửa giờ)', async () => {
    service.listMine.mockResolvedValue(cursorPage([makeScheduled({ mentions: [{ targetId: 'u-2', type: 'USER' }] })]));
    await renderWithProviders(<ScheduledMessagesScreen />);
    await screen.findByText('Kênh Chung');

    await openMenu();

    expect(await screen.findByText('Sửa giờ gửi')).toBeOnTheScreen();
    expect(screen.queryByText('Sửa nội dung')).toBeNull();
  });

  it('tin KHÔNG nhắc tên có "Sửa nội dung" → PATCH content kèm expectedVersion', async () => {
    service.update.mockResolvedValue(makeScheduled({ content: 'Đã sửa', version: 2 }));
    await renderWithProviders(<ScheduledMessagesScreen />);
    await screen.findByText('Kênh Chung');

    await pickMenu('Sửa nội dung');
    await fireEvent.changeText(await screen.findByDisplayValue('Nhớ nộp báo cáo'), 'Đã sửa');
    await fireEvent.press(screen.getByText('Lưu nội dung'));

    await waitFor(() => expect(service.update).toHaveBeenCalledWith('s-1', { content: 'Đã sửa', expectedVersion: 1 }));
    await flushQuery();
  });

  it('tin LỖI: menu chỉ có "Gửi lại" → hẹn MỚI cùng nội dung/tệp ở thời điểm chọn', async () => {
    service.create.mockResolvedValue(makeScheduled({ id: 's-3' }));
    mockParams.current = { id: 's-2' };
    await renderWithProviders(<ScheduledMessagesScreen />);
    await screen.findByText('Bạn không còn quyền gửi tin ở đây');

    await openMenu();
    expect(screen.queryByText('Huỷ tin hẹn giờ')).toBeNull();
    await fireEvent.press(await screen.findByText('Gửi lại'));
    await fireEvent.press(await screen.findByText('Hẹn gửi lại'));

    await waitFor(() => expect(service.create).toHaveBeenCalledTimes(1));
    expect(service.create.mock.calls[0]![0]).toMatchObject({ scopeId: 'ch-1', scopeType: 'CHANNEL' });
    expect(service.create.mock.calls[0]![1]).toMatchObject({ content: 'Nhớ nộp báo cáo', mentions: [], sendAt: new Date(NOW + 3_600_000).toISOString() });
    await flushQuery();
  });
});
