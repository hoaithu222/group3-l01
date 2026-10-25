import { fireEvent, render, screen } from '@testing-library/react-native';

import { useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { MentorEngagement } from '../api/mentor.types';
import { MentorGuestBanner } from '../components/MentorGuestBanner';
import { useMyEngagements } from '../queries/mentor.queries';
import { resetBannerSeen } from '../utils/banner-seen';

/**
 * Banner cho cố vấn ở hub nhóm (p6-03 app.md §7): "Bạn là cố vấn tới 30/10/2026 — chỉ thấy các kênh được mời", MỘT lần (đóng rồi không hiện lại
 * cho đợt đó, kể cả khi màn dựng lại). Chỉ khớp đợt ACTIVE của CHÍNH nhóm đang mở; cờ `mentor` tắt ⇒ không gọi API.
 */
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));
jest.mock('../queries/mentor.queries', () => ({ useMyEngagements: jest.fn() }));

const engagement = (over: Partial<MentorEngagement> = {}): MentorEngagement => ({
  channelIds: [],
  conversationId: null,
  endedAt: null,
  endedReason: null,
  endsAt: '2026-10-30T10:00:00.000Z',
  id: 'eng-1',
  mentor: { id: 'u-me', name: 'Tôi' },
  post: { id: 'post-1', title: 'Cần cố vấn backend' },
  postId: 'post-1',
  startedAt: '2026-09-30T10:00:00.000Z',
  status: 'ACTIVE',
  totalDays: 30,
  version: 1,
  workspace: { avatarUrl: null, id: 'ws-1', name: 'Nhóm Alpha' },
  ...over,
});

function mockEngagements(data: MentorEngagement[] | undefined): void {
  jest
    .mocked(useMyEngagements)
    .mockReturnValue({ data } as unknown as ReturnType<typeof useMyEngagements>);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetBannerSeen();
  jest.mocked(useFeature).mockReturnValue(true);
  useAuthStore
    .getState()
    .setAuth({
      token: 't',
      user: { email: 'a@b.c', id: 'u-me', name: 'Tôi', permissions: [], roles: [] },
    });
});

describe('MentorGuestBanner', () => {
  it('có đợt ACTIVE của nhóm này: nói rõ hạn (ngày cụ thể) và phạm vi quyền', async () => {
    mockEngagements([engagement()]);
    await render(<MentorGuestBanner wsId="ws-1" />);

    expect(screen.getByText('Bạn đang cố vấn cho nhóm này')).toBeOnTheScreen();
    expect(
      screen.getByText('Bạn là cố vấn tới 30/10/2026 — chỉ thấy các kênh được mời.'),
    ).toBeOnTheScreen();
  });

  it('đợt của nhóm KHÁC, đợt đã kết thúc, hoặc chưa có dữ liệu: không vẽ gì (khách thường đã có GuestAccessBanner)', async () => {
    mockEngagements([
      engagement({ workspace: { avatarUrl: null, id: 'ws-khac', name: 'Nhóm khác' } }),
    ]);
    const other = await render(<MentorGuestBanner wsId="ws-1" />);
    expect(screen.queryByText('Bạn đang cố vấn cho nhóm này')).toBeNull();
    await other.unmount();

    mockEngagements([engagement({ status: 'ENDED' })]);
    const ended = await render(<MentorGuestBanner wsId="ws-1" />);
    expect(screen.queryByText('Bạn đang cố vấn cho nhóm này')).toBeNull();
    await ended.unmount();

    mockEngagements(undefined);
    await render(<MentorGuestBanner wsId="ws-1" />);
    expect(screen.queryByText('Bạn đang cố vấn cho nhóm này')).toBeNull();
  });

  it('đóng banner (✕) → biến mất và KHÔNG hiện lại khi màn dựng lại; đợt cố vấn KHÁC thì vẫn hiện', async () => {
    mockEngagements([engagement()]);
    const first = await render(<MentorGuestBanner wsId="ws-1" />);

    await fireEvent.press(screen.getByRole('button', { name: /đóng/i }));
    expect(screen.queryByText('Bạn đang cố vấn cho nhóm này')).toBeNull();
    await first.unmount();

    await render(<MentorGuestBanner wsId="ws-1" />);
    expect(screen.queryByText('Bạn đang cố vấn cho nhóm này')).toBeNull();

    mockEngagements([engagement({ id: 'eng-2' })]);
    await render(<MentorGuestBanner wsId="ws-1" />);
    expect(screen.getByText('Bạn đang cố vấn cho nhóm này')).toBeOnTheScreen();
  });

  it('cờ `mentor` tắt hoặc chưa biết: không vẽ và không cho phép gọi API (enabled = false)', async () => {
    for (const flag of [false, undefined]) {
      jest.mocked(useFeature).mockReturnValue(flag);
      mockEngagements([engagement()]);
      const view = await render(<MentorGuestBanner wsId="ws-1" />);

      expect(screen.queryByText('Bạn đang cố vấn cho nhóm này')).toBeNull();
      expect(useMyEngagements).toHaveBeenLastCalledWith(false);
      await view.unmount();
    }
  });
});
