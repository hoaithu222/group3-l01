import { fireEvent, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import { mentorPostsService } from '../api/mentor-posts.service';
import { MentorPostDetailScreen } from '../screens/MentorPostDetailScreen';
import { apiError, makePostDetail, renderWithProviders } from './render-helpers';

/** app.md p6-03 §8 — nút "Ứng tuyển" theo `myActions.apply` do SERVER tính; 404 → "Bài không còn khả dụng". */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ postId: 'post-1' })),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('../api/mentor-posts.service', () => ({
  mentorPostsService: {
    apply: jest.fn(),
    detail: jest.fn(),
    report: jest.fn(),
    withdraw: jest.fn(),
  },
}));

const api = jest.mocked(mentorPostsService);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({ postId: 'post-1' });
});

describe('MentorPostDetailScreen', () => {
  it('myActions.apply=true → hiện "Ứng tuyển"; bấm mở tấm ứng tuyển', async () => {
    api.detail.mockResolvedValue(makePostDetail());
    await renderWithProviders(<MentorPostDetailScreen />);

    expect(await screen.findByText('Cần cố vấn kiến trúc backend')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Ứng tuyển'));
    expect(await screen.findByText('Ứng tuyển cố vấn')).toBeOnTheScreen();
    expect(screen.getByText('Gửi đơn')).toBeOnTheScreen();
  });

  it('myActions.apply=false (đã là thành viên/đã ứng tuyển) → KHÔNG có nút "Ứng tuyển"; đơn chờ → "Rút đơn"', async () => {
    api.detail.mockResolvedValue(
      makePostDetail({
        myActions: { apply: false, manage: false, report: true, withdraw: true },
        myApplication: { id: 'app-1', status: 'PENDING' },
      }),
    );
    await renderWithProviders(<MentorPostDetailScreen />);

    expect(await screen.findByText('Đơn của bạn: Đang chờ')).toBeOnTheScreen();
    expect(screen.queryByText('Ứng tuyển')).toBeNull();
    expect(screen.getByText('Rút đơn')).toBeOnTheScreen();
  });

  it('OWNER/ADMIN (manage) → "Xem đơn ứng tuyển", không có nút báo cáo', async () => {
    api.detail.mockResolvedValue(
      makePostDetail({ myActions: { apply: false, manage: true, report: false, withdraw: false } }),
    );
    await renderWithProviders(<MentorPostDetailScreen />);

    expect(await screen.findByText('Xem đơn ứng tuyển')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Báo cáo bài')).toBeNull();
  });

  it('404 (bài ẩn/không còn) → "Bài không còn khả dụng"', async () => {
    api.detail.mockRejectedValue(apiError(404, 'PERM_404'));
    await renderWithProviders(<MentorPostDetailScreen />);

    expect(await screen.findByText('Bài không còn khả dụng')).toBeOnTheScreen();
    expect(screen.getByText('Về bảng tin')).toBeOnTheScreen();
  });
});
