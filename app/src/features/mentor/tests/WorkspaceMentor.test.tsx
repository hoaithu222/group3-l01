import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useConnectionState } from '@/core/socket';

import { mentorEngagementsService } from '../api/mentor-engagements.service';
import { mentorPostsService } from '../api/mentor-posts.service';
import type { MentorManagedPost } from '../api/mentor.types';
import { CreateMentorPostScreen } from '../screens/CreateMentorPostScreen';
import { WorkspaceMentorScreen } from '../screens/WorkspaceMentorScreen';
import { apiError, makePostDetail, renderWithProviders } from './render-helpers';

/** app.md p6-03 §8 — quá 3 bài OPEN → nút đăng khoá có giải thích; form đăng bài lỗi TẠI TRƯỜNG; `MENTOR_001` → banner. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ wsId: 'ws-1' })),
}));
jest.mock('@/core/socket', () => ({ useConnectionState: jest.fn(() => 'connected') }));
jest.mock('../api/mentor-posts.service', () => ({
  mentorPostsService: { close: jest.fn(), create: jest.fn(), workspacePosts: jest.fn() },
}));
jest.mock('../api/mentor-engagements.service', () => ({
  mentorEngagementsService: { workspaceEngagements: jest.fn() },
}));

const posts = jest.mocked(mentorPostsService);
const managed = (id: string): MentorManagedPost => ({
  ...makePostDetail({ id, title: `Bài ${id}` }),
  hidden: false,
  pendingCount: 1,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useConnectionState).mockReturnValue('connected');
  jest.mocked(mentorEngagementsService.workspaceEngagements).mockResolvedValue([]);
});

describe('WorkspaceMentorScreen', () => {
  it('đủ 3 bài OPEN → "Đăng bài" khoá + giải thích bằng chữ', async () => {
    posts.workspacePosts.mockResolvedValue([managed('bai-a'), managed('bai-b'), managed('bai-c')]);
    await renderWithProviders(<WorkspaceMentorScreen />);

    expect(await screen.findByText(/Nhóm đã có 3 bài đang mở/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Đăng bài tìm cố vấn' })).toBeDisabled();
    expect(screen.getAllByText('1 đơn chờ')).toHaveLength(3);
  });

  it('403 (không phải OWNER/ADMIN) → ẩn nội dung', async () => {
    posts.workspacePosts.mockRejectedValue(apiError(403, 'PERM_001'));
    await renderWithProviders(<WorkspaceMentorScreen />);
    expect(await screen.findByText('Không xem được')).toBeOnTheScreen();
  });
});

describe('CreateMentorPostScreen', () => {
  it('bấm đăng khi trống → lỗi tại trường (tiêu đề, mô tả), KHÔNG gọi API', async () => {
    posts.workspacePosts.mockResolvedValue([]);
    await renderWithProviders(<CreateMentorPostScreen />);

    await fireEvent.press(await screen.findByText('Đăng bài'));
    expect(await screen.findByText('Tiêu đề tối thiểu 5 ký tự')).toBeOnTheScreen();
    expect(screen.getByText('Mô tả tối thiểu 20 ký tự')).toBeOnTheScreen();
    expect(posts.create).not.toHaveBeenCalled();
  });

  it('MENTOR_001 từ server → banner dưới form, giữ nguyên dữ liệu đã nhập', async () => {
    posts.workspacePosts.mockResolvedValue([]);
    posts.create.mockRejectedValue(apiError(409, 'MENTOR_001'));
    await renderWithProviders(<CreateMentorPostScreen />);

    await fireEvent.changeText(await screen.findByLabelText(/Tiêu đề/), 'Cần cố vấn backend');
    await fireEvent.changeText(
      screen.getByLabelText(/Mô tả khó khăn/),
      'Nhóm đang vướng thiết kế cơ sở dữ liệu.',
    );
    await fireEvent.changeText(screen.getByLabelText(/Kỹ năng cần/), 'MongoDB');
    await fireEvent.press(screen.getByText('Thêm'));
    await fireEvent.press(screen.getByText('Đăng bài'));

    await waitFor(() => expect(posts.create).toHaveBeenCalled());
    expect(posts.create.mock.calls[0]?.[1]).toMatchObject({
      mentorsNeeded: 1,
      skills: ['MongoDB'],
      title: 'Cần cố vấn backend',
    });
    expect(
      await screen.findByText('Nhóm đã có tối đa số bài tìm cố vấn đang mở'),
    ).toBeOnTheScreen();
  });
});
