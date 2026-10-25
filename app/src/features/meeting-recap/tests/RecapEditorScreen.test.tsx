import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { meetingRecapService } from '../api/meeting-recap.service';
import { useMarkdownFormatting } from '../hooks/useMarkdownFormatting';
import { RecapEditorScreen } from '../screens/RecapEditorScreen';
import { apiError, makeRecap, renderWithProviders } from './helpers';

/** Trình soạn biên bản (app.md p2-06 §3, §8): 409 giữ bản nhập; công bố sau khi lưu; thanh chèn `**…**` quanh vùng chọn; không sửa được → màn trung tính. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/core/socket', () => ({ useConnectionState: jest.fn(() => 'connected'), useRoomSubscription: jest.fn(), useSocketEvent: jest.fn() }));
jest.mock('@/core/uploads/use-upload', () => ({ useUpload: () => ({ cancel: jest.fn(), enqueue: jest.fn(), items: [], retry: jest.fn() }) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../queries/meeting-title.queries', () => ({ useMeetingTitle: () => 'Họp giao ban' }));
jest.mock('../api/meeting-recap.service', () => ({
  meetingRecapService: { attach: jest.fn(), detach: jest.fn(), get: jest.fn(), publish: jest.fn(), upsert: jest.fn() },
  meetingRecordingService: {},
}));

const svc = jest.mocked(meetingRecapService);
const input = () => screen.getByLabelText('Nội dung biên bản');

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ meetingId: 'meet-1' });
});

describe('RecapEditorScreen', () => {
  it('RR-01: lưu bị 409 RES_003 → "Biên bản vừa được người khác sửa", bản nhập KHÔNG mất; "Xem bản mới" nạp bản server, "Dùng lại bản của tôi" rồi lưu với version MỚI', async () => {
    svc.get.mockResolvedValueOnce(makeRecap({ content: 'bản gốc', version: 3 }));
    svc.upsert.mockRejectedValueOnce(apiError(409, 'RES_003', { current: 5 }));
    await renderWithProviders(<RecapEditorScreen />);

    await fireEvent.changeText(await screen.findByLabelText('Nội dung biên bản'), 'bản của tôi');
    await fireEvent.press(screen.getByText('Lưu nháp'));
    expect(await screen.findByText('Biên bản vừa được người khác sửa')).toBeOnTheScreen();
    expect(svc.upsert).toHaveBeenCalledWith('meet-1', expect.objectContaining({ content: 'bản của tôi', expectedVersion: 3 }));
    expect(input().props.value).toBe('bản của tôi');

    svc.get.mockResolvedValueOnce(makeRecap({ content: 'bản của người khác', version: 5 }));
    await fireEvent.press(screen.getByText('Xem bản mới'));
    await waitFor(() => expect(input().props.value).toBe('bản của người khác'));
    expect(screen.getByText('Bản của bạn (chưa lưu)')).toBeOnTheScreen();
    expect(screen.getByText('bản của tôi')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Dùng lại bản của tôi'));
    expect(input().props.value).toBe('bản của tôi');
    svc.upsert.mockResolvedValueOnce(makeRecap({ content: 'bản của tôi', version: 6 }));
    await fireEvent.press(screen.getByText('Lưu nháp'));
    await waitFor(() => expect(svc.upsert).toHaveBeenLastCalledWith('meet-1', expect.objectContaining({ content: 'bản của tôi', expectedVersion: 5 })));
  });

  it('lần lưu ĐẦU (chưa có bản ghi, version 0) không gửi expectedVersion; "Công bố" lưu trước rồi công bố đúng version vừa lưu, xong về chi tiết', async () => {
    svc.get.mockResolvedValueOnce(makeRecap({ content: '', recapId: null, version: 0 }));
    svc.upsert.mockResolvedValueOnce(makeRecap({ content: 'nội dung', version: 1 }));
    svc.publish.mockResolvedValueOnce(makeRecap({ content: 'nội dung', publishedAt: '2026-09-25T04:00:00.000Z', version: 2 }));
    await renderWithProviders(<RecapEditorScreen />);

    await fireEvent.changeText(await screen.findByLabelText('Nội dung biên bản'), 'nội dung');
    await fireEvent.press(screen.getByText('Công bố'));
    await fireEvent.press(screen.getByText('Công bố biên bản'));
    await waitFor(() => expect(svc.publish).toHaveBeenCalledWith('meet-1', 1));
    expect(svc.upsert.mock.calls[0]?.[1]).not.toHaveProperty('expectedVersion', expect.anything());
    expect(router.back).toHaveBeenCalled();
  });

  it('công bố rỗng → 400 MEET_023 hiện NGAY dưới ô nội dung, không toast chung', async () => {
    svc.get.mockResolvedValueOnce(makeRecap({ content: '', version: 2 }));
    svc.publish.mockRejectedValueOnce(apiError(400, 'MEET_023'));
    await renderWithProviders(<RecapEditorScreen />);

    await fireEvent.press(await screen.findByText('Công bố'));
    await fireEvent.press(screen.getByText('Công bố biên bản'));
    expect(await screen.findByText(/Biên bản cần có nội dung/)).toBeOnTheScreen();
  });

  it('không được sửa (người xem nhận bản đã công bố) → "Không sửa được biên bản", không có ô soạn', async () => {
    svc.get.mockResolvedValueOnce(makeRecap({ myActions: { canEdit: false, canPublish: false } }));
    await renderWithProviders(<RecapEditorScreen />);
    expect(await screen.findByText('Không sửa được biên bản')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Nội dung biên bản')).toBeNull();
  });
});

describe('useMarkdownFormatting — thanh chèn nhanh', () => {
  it('"Đậm" bọc `**…**` quanh vùng chọn cuối cùng ô báo, rồi ép vùng chọn MỘT lần', async () => {
    const onChange = jest.fn();
    const { result } = await renderHook(() => useMarkdownFormatting('chốt ngân sách', onChange));
    await act(async () => result.current.onSelectionChange({ end: 14, start: 5 }));
    await act(async () => result.current.format('bold'));
    expect(onChange).toHaveBeenCalledWith('chốt **ngân sách**');
    expect(result.current.forced).toEqual({ end: 16, start: 7 });
    await act(async () => result.current.onSelectionChange({ end: 16, start: 16 }));
    expect(result.current.forced).toBeUndefined();
  });
});
