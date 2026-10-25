import { fireEvent, screen, within } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { mentorEngagementsService } from '../api/mentor-engagements.service';
import { mentorPostsService } from '../api/mentor-posts.service';
import { MentorBoardScreen } from '../screens/MentorBoardScreen';
import { makePostDetail, renderWithProviders } from './render-helpers';

/** Bảng tin (app.md §3): thẻ bài (nhóm + kỹ năng + "Cần N · Đã có M"), lọc giữ ở URL, rỗng có "Xoá bộ lọc", tab "Đang cố vấn" ẩn khi rỗng. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/core/socket', () => ({
  SocketEvent: { PERMISSION_REVOKED: 'permission:revoked' },
  useConnectionState: jest.fn(() => 'connected'),
  useSocketEvent: jest.fn(),
}));
jest.mock('../api/mentor-posts.service', () => ({
  mentorPostsService: { feed: jest.fn(), myApplications: jest.fn() },
}));
jest.mock('../api/mentor-engagements.service', () => ({
  mentorEngagementsService: { managedWorkspaces: jest.fn(), myEngagements: jest.fn() },
}));

const posts = jest.mocked(mentorPostsService);
const engagements = jest.mocked(mentorEngagementsService);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useLocalSearchParams).mockReturnValue({});
  engagements.managedWorkspaces.mockResolvedValue([]);
  engagements.myEngagements.mockResolvedValue([]);
});

describe('MentorBoardScreen', () => {
  it('hiện thẻ bài; chạm → chi tiết; không có tab "Đang cố vấn" khi chưa cố vấn nhóm nào; không có nút Quản lý', async () => {
    posts.feed.mockResolvedValue({
      items: [makePostDetail({ activeEngagements: 1, mentorsNeeded: 2 })],
      nextCursor: null,
    });
    await renderWithProviders(<MentorBoardScreen />);

    expect(await screen.findByText('Cần cố vấn kiến trúc backend')).toBeOnTheScreen();
    // Kỹ năng hiện thành huy hiệu riêng từng cái (trước là một dòng "Node.js · MongoDB") và có trong nhãn đọc của thẻ. Tìm TRONG thẻ:
    // cùng hai chữ đó còn là chip gợi ý của bộ lọc kỹ năng ở đầu danh sách.
    const card = screen.getByRole('button', { name: /Kỹ năng: Node\.js, MongoDB/ });
    expect(within(card).getByText('Node.js')).toBeOnTheScreen();
    expect(within(card).getByText('MongoDB')).toBeOnTheScreen();
    expect(screen.getByText(/Cần 2 · Đã có 1/)).toBeOnTheScreen();
    expect(screen.queryByText('Đang cố vấn')).toBeNull();
    expect(screen.queryByText('Quản lý')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /Cần cố vấn kiến trúc backend/ }));
    expect(router.push).toHaveBeenCalledWith({
      params: { postId: 'post-1' },
      pathname: '/mentor/[postId]',
    });
  });

  it('lọc kỹ năng từ URL gửi lên server; rỗng khi có lọc → "Xoá bộ lọc" xoá params', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ skills: 'Rust' });
    posts.feed.mockResolvedValue({ items: [], nextCursor: null });
    await renderWithProviders(<MentorBoardScreen />);

    expect(await screen.findByText('Chưa có nhóm nào tìm cố vấn phù hợp')).toBeOnTheScreen();
    expect(posts.feed).toHaveBeenCalledWith({ q: undefined, skills: ['Rust'] }, undefined);
    await fireEvent.press(screen.getByText('Xoá bộ lọc'));
    expect(router.setParams).toHaveBeenCalledWith({ q: undefined, skills: undefined });
  });

  it('là OWNER/ADMIN ở một nhóm → nút "Quản lý"; đang cố vấn → có tab "Đang cố vấn"', async () => {
    posts.feed.mockResolvedValue({ items: [], nextCursor: null });
    engagements.managedWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Nhóm đồ án' }]);
    engagements.myEngagements.mockResolvedValue([
      {
        channelIds: [],
        conversationId: null,
        endedAt: null,
        endedReason: null,
        endsAt: '2026-10-20T00:00:00.000Z',
        id: 'dot-1',
        mentor: { id: 'toi', name: 'Tôi' },
        post: { id: 'post-1', title: 'Bài A' },
        postId: 'post-1',
        startedAt: '2026-09-20T00:00:00.000Z',
        status: 'ACTIVE',
        totalDays: 30,
        version: 1,
        workspace: { avatarUrl: null, id: 'ws-2', name: 'Nhóm B' },
      },
    ]);
    await renderWithProviders(<MentorBoardScreen />);

    expect(await screen.findByText('Quản lý')).toBeOnTheScreen();
    expect(await screen.findByText('Đang cố vấn')).toBeOnTheScreen();
  });
});
