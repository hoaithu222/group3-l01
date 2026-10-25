import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { mentorEngagementsService } from '../api/mentor-engagements.service';
import { mentorPostsService } from '../api/mentor-posts.service';
import type { MentorApplication } from '../api/mentor.types';
import { ApplicationReviewScreen } from '../screens/ApplicationReviewScreen';
import { apiError, makePostDetail, renderWithProviders } from './render-helpers';

/** app.md p6-03 §8 — 409 `MENTOR_005` khi chấp nhận (bài vừa đủ/đổi phiên bản — IR-22) → toast + tải lại bài và đơn. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ postId: 'post-1', wsId: 'ws-1' })),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/mentor-posts.service', () => ({
  mentorPostsService: {
    accept: jest.fn(),
    detail: jest.fn(),
    postApplications: jest.fn(),
    reject: jest.fn(),
  },
}));
jest.mock('../api/mentor-engagements.service', () => ({
  mentorEngagementsService: { channelOptions: jest.fn(), memberOptions: jest.fn() },
}));

const posts = jest.mocked(mentorPostsService);
const engagements = jest.mocked(mentorEngagementsService);

const application: MentorApplication = {
  applicant: { avatarUrl: null, id: 'nguoi-ut', name: 'Cố vấn X' },
  createdAt: '2026-09-21T00:00:00.000Z',
  id: 'don-1',
  message: 'Tôi có kinh nghiệm backend 5 năm.',
  portfolioUrl: 'https://github.com/co-van-x',
  postId: 'post-1',
  rejectReason: null,
  reviewedAt: null,
  status: 'PENDING',
  workspaceId: 'ws-1',
};

beforeEach(() => {
  jest.clearAllMocks();
  posts.detail.mockResolvedValue(
    makePostDetail({ myActions: { apply: false, manage: true, report: false, withdraw: false } }),
  );
  posts.postApplications.mockResolvedValue({ items: [application], nextCursor: null });
  engagements.channelOptions.mockResolvedValue([
    { id: 'kenh-chung', isDefault: true, name: 'Chung', visibility: 'PUBLIC' },
  ]);
  engagements.memberOptions.mockResolvedValue([]);
});

describe('ApplicationReviewScreen', () => {
  it('409 MENTOR_005 → toast cảnh báo, đóng tấm, tải lại bài + danh sách đơn', async () => {
    posts.accept.mockRejectedValue(apiError(409, 'MENTOR_005'));
    await renderWithProviders(<ApplicationReviewScreen />);

    expect(await screen.findByText('Tôi có kinh nghiệm backend 5 năm.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Chấp nhận'));
    expect(await screen.findByText('# Chung · mặc định')).toBeOnTheScreen();
    const detailCalls = posts.detail.mock.calls.length;
    const listCalls = posts.postApplications.mock.calls.length;
    await fireEvent.press(screen.getByText('Chấp nhận cố vấn'));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'warning',
        'Bài đã đủ cố vấn hoặc vừa thay đổi, tải lại rồi thử lại',
      ),
    );
    await waitFor(() => expect(posts.detail.mock.calls.length).toBeGreaterThan(detailCalls));
    expect(posts.postApplications.mock.calls.length).toBeGreaterThan(listCalls);
    expect(posts.accept).toHaveBeenCalledWith(
      'don-1',
      expect.objectContaining({ expectedPostVersion: 1 }),
      expect.any(String),
    );
    await waitFor(() => expect(screen.queryByText('Chấp nhận cố vấn')).toBeNull());
  });

  it('bài đã đủ cố vấn → giải thích + khoá nút Chấp nhận (đơn chờ vẫn hiện)', async () => {
    posts.detail.mockResolvedValue(
      makePostDetail({
        activeEngagements: 1,
        myActions: { apply: false, manage: true, report: false, withdraw: false },
        status: 'FULFILLED',
      }),
    );
    await renderWithProviders(<ApplicationReviewScreen />);

    expect(await screen.findByText(/Bài đã đủ cố vấn hoặc đã đóng/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Chấp nhận' })).toBeDisabled();
  });
});
