import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';
import { useAuthStore } from '@/shell/store/slices/auth';

import { meetingsService } from '../api/meetings.service';
import { MeetingDetailScreen } from '../screens/MeetingDetailScreen';
import { makeActions, makeMeeting } from './fixtures';
import { apiError, renderWithProviders } from './render-helpers';

/** Màn chi tiết (app.md p2-04 §3): 404 "không còn khả dụng", nhóm chat của cuộc họp, huỷ, và bị xoá khỏi danh sách khi đang xem. */
const mockHandlers = new Map<string, (payload: unknown) => void>();
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/core/socket', () => ({
  SocketEvent: jest.requireActual('@/core/socket/socket.events').SocketEvent,
  useRoomSubscription: jest.fn(() => ({ status: 'joined' })),
  useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(event, handler);
  },
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/meetings.service', () => ({
  meetingsService: { get: jest.fn(), listAttendees: jest.fn() },
}));

const get = jest.mocked(meetingsService.get);

beforeEach(() => {
  jest.clearAllMocks();
  mockHandlers.clear();
  useAuthStore.setState({ user: { id: 'me' } } as never);
  jest.mocked(useLocalSearchParams).mockReturnValue({ meetingId: 'm1' });
  jest
    .mocked(meetingsService.listAttendees)
    .mockResolvedValue({ items: [], meta: { hasMore: false, limit: 50, nextCursor: null } });
});

describe('MeetingDetailScreen', () => {
  it('404 (huỷ/xoá/mất quyền — server không phân biệt): "Cuộc họp không còn khả dụng" + về lịch', async () => {
    get.mockRejectedValue(apiError(404, 'MEET_001'));
    await renderWithProviders(<MeetingDetailScreen />);

    expect(await screen.findByText('Cuộc họp không còn khả dụng')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Về lịch họp'));
    expect(router.replace).toHaveBeenCalledWith('/meetings');
  });

  it('lỗi khác (mạng): thông báo + "Thử lại" lấy lại chi tiết', async () => {
    get.mockRejectedValueOnce(new Error('mạng'));
    await renderWithProviders(<MeetingDetailScreen />);

    expect(await screen.findByText('Không mở được cuộc họp')).toBeOnTheScreen();
    get.mockResolvedValue(makeMeeting());
    await fireEvent.press(screen.getByText('Thử lại'));
    expect(await screen.findByText('Họp giao ban')).toBeOnTheScreen();
  });

  it('có nhóm chat của cuộc họp ⇒ dòng "Nhóm chat của cuộc họp" đi tới hội thoại; không có ⇒ không có mục', async () => {
    get.mockResolvedValue(makeMeeting({ conversationId: 'conv-9' }));
    await renderWithProviders(<MeetingDetailScreen />);

    await fireEvent.press(await screen.findByText('Nhóm chat của cuộc họp'));
    expect(router.push).toHaveBeenCalledWith({
      params: { conversationId: 'conv-9' },
      pathname: '/messages/[conversationId]',
    });
  });

  it('không có nhóm chat ⇒ không có mục "Nhóm chat" (và không vẽ cả khối "Trao đổi & tài liệu")', async () => {
    get.mockResolvedValue(makeMeeting());
    await renderWithProviders(<MeetingDetailScreen />);

    await screen.findByText('Họp giao ban');
    expect(screen.queryByText('Nhóm chat của cuộc họp')).toBeNull();
    expect(screen.queryByText('Trao đổi & tài liệu')).toBeNull();
  });

  it('nút vào họp nằm ở THANH ĐÁY, hành động phụ nằm ở menu AppBar — thân màn không còn nút Sửa/Huỷ/Xoá/Chia sẻ', async () => {
    get.mockResolvedValue(
      makeMeeting({
        myActions: makeActions({ canCancel: true, canDelete: true, canEdit: true, canStart: true }),
        myRole: 'HOST',
      }),
    );
    await renderWithProviders(<MeetingDetailScreen />);

    expect(await screen.findByRole('button', { name: 'Bắt đầu cuộc họp' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tuỳ chọn cuộc họp' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Chia sẻ lời mời họp' })).toBeOnTheScreen();
    // Sửa/Huỷ/Xoá chỉ có trong tấm menu (chưa mở) — không có nút nào cùng tên trong thân màn.
    expect(screen.queryByText('Sửa cuộc họp')).toBeNull();
    expect(screen.queryByText('Huỷ cuộc họp')).toBeNull();
    expect(screen.queryByText('Xoá cuộc họp')).toBeNull();
  });

  it('đã huỷ: banner kèm lý do, tiêu đề vẫn đọc được, trạng thái bằng CHỮ', async () => {
    get.mockResolvedValue(
      makeMeeting({ cancelReason: 'Trùng lịch', myActions: makeActions(), status: 'CANCELLED' }),
    );
    await renderWithProviders(<MeetingDetailScreen />);

    expect(await screen.findByText('Cuộc họp đã huỷ')).toBeOnTheScreen();
    expect(screen.getByText('Lý do: Trùng lịch')).toBeOnTheScreen();
    expect(screen.getByText('Đã huỷ')).toBeOnTheScreen();
  });

  it('bị xoá khỏi danh sách khi đang xem (meeting:attendee-removed của MÌNH) ⇒ toast + quay lại; của người khác thì không', async () => {
    get.mockResolvedValue(makeMeeting());
    await renderWithProviders(<MeetingDetailScreen />);
    await screen.findByText('Họp giao ban');

    await act(async () =>
      mockHandlers.get('meeting:attendee-removed')?.({ meetingId: 'm1', userId: 'other' }),
    );
    expect(router.back).not.toHaveBeenCalled();
    await act(async () =>
      mockHandlers.get('meeting:attendee-removed')?.({ meetingId: 'm1', userId: 'me' }),
    );
    expect(showToast).toHaveBeenCalledWith('info', 'Bạn không còn trong cuộc họp này.');
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
