import { fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { meetingRecordingService } from '../api/meeting-recap.service';
import { MeetingRecapMessage } from '../components/cards/MeetingRecapMessage';
import { MeetingRecordingReadyMessage } from '../components/cards/MeetingRecordingReadyMessage';
import { RecordingPlayerScreen } from '../screens/RecordingPlayerScreen';
import { apiError, makeRecording, renderWithProviders } from './helpers';

/** Thẻ tin hệ thống trong nhóm chat (app.md §3) + màn phát bản ghi (trạng thái lỗi/đã xoá, nút tải chỉ cho người có quyền). */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('expo-video', () => ({ useVideoPlayer: () => ({ addListener: () => ({ remove: jest.fn() }) }), VideoView: () => null }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => false), shareAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', createDownloadResumable: jest.fn(), deleteAsync: jest.fn(), makeDirectoryAsync: jest.fn() }));
jest.mock('@/core/socket', () => ({ useConnectionState: jest.fn(() => 'connected') }));
jest.mock('../queries/meeting-title.queries', () => ({ useMeetingTitle: () => 'Họp giao ban' }));
jest.mock('../api/meeting-recap.service', () => ({ meetingRecapService: {}, meetingRecordingService: { get: jest.fn(), url: jest.fn() } }));

const svc = jest.mocked(meetingRecordingService);
const message = (systemType: string, systemPayload: Record<string, unknown>) => ({ systemPayload, systemType });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ meetingId: 'meet-1', recordingId: 'rec-1' });
});

describe('thẻ tin hệ thống', () => {
  it('MEETING_RECAP: tiêu đề + trích đoạn + số tệp; "Xem biên bản" mở màn biên bản; trường lạ trong payload KHÔNG ra màn', async () => {
    const payload = { attachmentCount: 2, excerpt: 'Chốt ngân sách quý 4', meetingId: 'meet-1', secret: 'NỘI-BỘ', title: 'Giao ban' };
    await renderWithProviders(<MeetingRecapMessage message={message('MEETING_RECAP', payload)} />);
    expect(screen.getByText('Biên bản: Giao ban')).toBeOnTheScreen();
    expect(screen.getByText('Chốt ngân sách quý 4')).toBeOnTheScreen();
    expect(screen.getByText('2 tệp đính kèm')).toBeOnTheScreen();
    expect(screen.queryByText(/NỘI-BỘ/)).toBeNull();
    await fireEvent.press(screen.getByText('Xem biên bản'));
    expect(router.push).toHaveBeenCalledWith({ params: { meetingId: 'meet-1' }, pathname: '/meetings/[meetingId]/recap' });
  });

  it('MEETING_RECORDING_READY: "Bản ghi cuộc họp đã sẵn sàng · 45 phút" + "Xem" mở trình phát; thiếu id thì không có nút', async () => {
    await renderWithProviders(<MeetingRecordingReadyMessage message={message('MEETING_RECORDING_READY', { durationSec: 2700, meetingId: 'meet-1', recordingId: 'rec-9' })} />);
    expect(screen.getByText('Bản ghi cuộc họp đã sẵn sàng · 45 phút')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Xem'));
    expect(router.push).toHaveBeenCalledWith({ params: { meetingId: 'meet-1', recordingId: 'rec-9' }, pathname: '/meetings/[meetingId]/recordings/[recordingId]' });

    await renderWithProviders(<MeetingRecordingReadyMessage message={message('MEETING_RECORDING_READY', {})} />);
    expect(screen.queryByText('Xem')).toBeNull();
  });
});

describe('RecordingPlayerScreen', () => {
  it('bản ghi đã xoá/hết hạn (REC_005) → "Bản ghi không còn khả dụng" + về chi tiết', async () => {
    svc.get.mockRejectedValue(apiError(404, 'REC_005'));
    svc.url.mockRejectedValue(apiError(404, 'REC_005'));
    await renderWithProviders(<RecordingPlayerScreen />);
    expect(await screen.findByText('Bản ghi không còn khả dụng')).toBeOnTheScreen();
    expect(screen.getByText('Bản ghi đã bị xoá hoặc hết hạn lưu trữ.')).toBeOnTheScreen();
  });

  it('phát được: trình phát hiện, "Tải về" CHỈ khi canDownload', async () => {
    svc.url.mockResolvedValue({ expiresAt: new Date(Date.now() + 900_000).toISOString(), mime: 'video/mp4', url: 'https://s3/a' });
    svc.get.mockResolvedValue(makeRecording());
    await renderWithProviders(<RecordingPlayerScreen />);
    expect(await screen.findByLabelText('Trình phát bản ghi cuộc họp')).toBeOnTheScreen();
    expect(screen.queryByText('Tải về')).toBeNull();
  });
});
