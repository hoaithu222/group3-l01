import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { meetingRecordingService } from '../api/meeting-recap.service';
import { RecordingsScreen } from '../screens/RecordingsScreen';
import { apiError, makeRecording, renderWithProviders } from './helpers';

/** Danh sách bản ghi (app.md p2-06 §3): READY → Xem; FAILED + canRetry → Thử lại; xoá có xác nhận (+ lý do khi BE đòi — RR-20); rỗng. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/core/socket', () => ({ useConnectionState: jest.fn(() => 'connected'), useRoomSubscription: jest.fn(), useSocketEvent: jest.fn() }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => false), shareAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', createDownloadResumable: jest.fn(), deleteAsync: jest.fn(), makeDirectoryAsync: jest.fn() }));
jest.mock('../queries/meeting-title.queries', () => ({ useMeetingTitle: () => 'Họp giao ban' }));
jest.mock('../api/meeting-recap.service', () => ({
  meetingRecapService: {},
  meetingRecordingService: { list: jest.fn(), remove: jest.fn(), retryImport: jest.fn(), url: jest.fn() },
}));

const svc = jest.mocked(meetingRecordingService);
const HOST_ACTIONS = { canDelete: true, canDownload: true, canRetry: false, canStop: false };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ meetingId: 'meet-1' });
});

describe('RecordingsScreen', () => {
  it('người xem: bản READY có thời lượng + dung lượng + trạng thái bằng chữ + hạn tự xoá; "Xem" mở trình phát; không có menu Tải/Xoá', async () => {
    svc.list.mockResolvedValue([makeRecording()]);
    await renderWithProviders(<RecordingsScreen />);

    expect(await screen.findByText('Sẵn sàng')).toBeOnTheScreen();
    expect(screen.getByText(/45 phút · 50 MB/)).toBeOnTheScreen();
    expect(screen.getByText(/Tự xoá sau \d+ ngày/)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Tuỳ chọn bản ghi')).toBeNull();
    await fireEvent.press(screen.getByText('Xem'));
    expect(router.push).toHaveBeenCalledWith({ params: { meetingId: 'meet-1', recordingId: 'rec-1' }, pathname: '/meetings/[meetingId]/recordings/[recordingId]' });
  });

  it('chưa có bản ghi: "Cuộc họp chưa có bản ghi nào"', async () => {
    svc.list.mockResolvedValue([]);
    await renderWithProviders(<RecordingsScreen />);
    expect(await screen.findByText('Cuộc họp chưa có bản ghi nào')).toBeOnTheScreen();
  });

  it('chủ trì: bản FAILED có lỗi đã làm sạch + "Thử lại" (canRetry) gọi retry-import và vá hàng thành "Đang xử lý"', async () => {
    svc.list.mockResolvedValue([makeRecording({ error: 'Lỗi egress', myActions: { ...HOST_ACTIONS, canRetry: true }, status: 'FAILED' })]);
    svc.retryImport.mockResolvedValue(makeRecording({ status: 'PROCESSING' }));
    await renderWithProviders(<RecordingsScreen />);

    expect(await screen.findByText('Lỗi egress')).toBeOnTheScreen();
    expect(screen.queryByText('Xem')).toBeNull(); // chưa READY thì không phát
    await fireEvent.press(screen.getByText('Thử lại'));
    await waitFor(() => expect(svc.retryImport).toHaveBeenCalledWith('rec-1'));
    expect(await screen.findByText('Đang xử lý')).toBeOnTheScreen();
  });

  it('RR-20: OWNER xoá → BE đòi lý do (400 VAL_001) → hộp thoại hiện ô lý do, chỉ gửi khi ≥ 10 ký tự; xoá xong gỡ khỏi danh sách', async () => {
    svc.list.mockResolvedValue([makeRecording({ myActions: HOST_ACTIONS })]);
    svc.remove.mockRejectedValueOnce(apiError(400, 'VAL_001', { reason: ['Lý do bắt buộc'] })).mockResolvedValueOnce(undefined);
    await renderWithProviders(<RecordingsScreen />);

    await fireEvent.press(await screen.findByLabelText('Tuỳ chọn bản ghi'));
    await fireEvent.press(screen.getByText('Xoá bản ghi'));
    expect(screen.getByText('Xoá bản ghi cuộc họp?')).toBeOnTheScreen();
    await fireEvent.press(screen.getAllByText('Xoá bản ghi').at(-1)!);
    await waitFor(() => expect(svc.remove).toHaveBeenCalledWith('rec-1', undefined));

    await fireEvent.changeText(await screen.findByLabelText('Lý do xoá'), 'ngắn');
    expect(screen.getByText(/Nhập ít nhất 10 ký tự/)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Lý do xoá'), 'Ghi nhầm cuộc họp riêng tư');
    await fireEvent.press(screen.getAllByText('Xoá bản ghi').at(-1)!);
    await waitFor(() => expect(svc.remove).toHaveBeenLastCalledWith('rec-1', 'Ghi nhầm cuộc họp riêng tư'));
    expect(await screen.findByText('Cuộc họp chưa có bản ghi nào')).toBeOnTheScreen();
  });

  it('404 (cuộc họp bị xoá/mất quyền) → "Bản ghi không còn khả dụng" + về chi tiết', async () => {
    svc.list.mockRejectedValue(apiError(404, 'MEET_001'));
    await renderWithProviders(<RecordingsScreen />);
    expect(await screen.findByText('Bản ghi không còn khả dụng')).toBeOnTheScreen();
  });
});
