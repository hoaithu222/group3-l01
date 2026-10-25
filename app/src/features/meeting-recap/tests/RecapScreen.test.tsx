import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { meetingRecapService } from '../api/meeting-recap.service';
import { RecapScreen } from '../screens/RecapScreen';
import { apiError, makeRecap, renderWithProviders } from './helpers';

/** Màn XEM biên bản (app.md p2-06 §3, §8): nháp vs đã công bố vs rỗng theo `myActions`; người xem không bao giờ thấy nháp (404). */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/core/socket', () => ({ useRoomSubscription: jest.fn(), useSocketEvent: jest.fn() }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meeting-recap.service', () => ({
  meetingRecapService: { get: jest.fn(), publish: jest.fn() },
  meetingRecordingService: {},
}));

const get = jest.mocked(meetingRecapService.get);
const publish = jest.mocked(meetingRecapService.publish);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ meetingId: 'meet-1' });
});

describe('RecapScreen', () => {
  it('người sửa, nháp CHƯA công bố: dải "Bản nháp — chỉ người viết biên bản thấy", nội dung markdown-lite, "Công bố" hỏi xác nhận rồi gửi đúng version', async () => {
    get.mockResolvedValue(makeRecap());
    publish.mockResolvedValue(makeRecap({ hasUnpublishedChanges: false, publishedAt: '2026-09-25T04:00:00.000Z', publishedVersion: 4, version: 4 }));
    await renderWithProviders(<RecapScreen />);

    expect(await screen.findByText('Bản nháp — chỉ người viết biên bản thấy')).toBeOnTheScreen();
    expect(screen.getByText('ngân sách')).toBeOnTheScreen();
    expect(screen.getByLabelText('Việc cần làm')).toBeOnTheScreen(); // ô việc cần làm chỉ hiển thị
    await fireEvent.press(screen.getByText('Công bố'));
    expect(screen.getByText('Mọi người trong cuộc họp sẽ nhận thông báo và biên bản được đăng vào nhóm chat.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Công bố biên bản'));
    await waitFor(() => expect(publish).toHaveBeenCalledWith('meet-1', 3));
    expect(await screen.findByText(/Đã công bố lúc/)).toBeOnTheScreen();
  });

  it('người xem, bản đã công bố: không dải trạng thái, không nút Sửa/Công bố — chỉ đọc', async () => {
    get.mockResolvedValue(makeRecap({ hasUnpublishedChanges: false, myActions: { canEdit: false, canPublish: false }, publishedAt: '2026-09-25T04:00:00.000Z', publishedVersion: 3 }));
    await renderWithProviders(<RecapScreen />);

    expect(await screen.findByText('ngân sách')).toBeOnTheScreen();
    expect(screen.queryByText('Sửa biên bản')).toBeNull();
    expect(screen.queryByText('Công bố')).toBeNull();
    expect(screen.queryByText(/Bản nháp/)).toBeNull();
  });

  it('người xem khi còn nháp → BE 404: nói trung tính "Chủ trì chưa công bố biên bản" + về chi tiết (không lộ nháp)', async () => {
    get.mockRejectedValue(apiError(404, 'MEET_001'));
    await renderWithProviders(<RecapScreen />);

    expect(await screen.findByText('Chưa có biên bản để xem')).toBeOnTheScreen();
    expect(screen.getByText(/Chủ trì chưa công bố biên bản/)).toBeOnTheScreen();
    expect(get).toHaveBeenCalledTimes(1); // 404 là kết luận — không thử lại
  });

  it('chủ trì, chưa có biên bản (nháp rỗng ảo recapId=null): "Chưa có biên bản" + "Viết biên bản" mở trình soạn', async () => {
    get.mockResolvedValue(makeRecap({ content: '', recapId: null, version: 0 }));
    await renderWithProviders(<RecapScreen />);

    expect(await screen.findByText('Chưa có biên bản')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Viết biên bản'));
    expect(router.replace).toHaveBeenCalledWith({ params: { meetingId: 'meet-1' }, pathname: '/meetings/[meetingId]/recap-edit' });
  });
});
