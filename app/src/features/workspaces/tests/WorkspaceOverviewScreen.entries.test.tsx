import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';

import type { WorkspaceOverview, WorkspaceRole } from '../api';
import { useWorkspaceOverview } from '../queries/workspaces.queries';
import { WorkspaceOverviewScreen } from '../screens/WorkspaceOverviewScreen';

import { renderWithProviders } from './test-utils';

/**
 * Lối vào ở tổng quan nhóm: MỘT khung "Lối vào nhanh" — lưới ô bấm được (Kênh · Thành viên · Lịch họp · Ví nhóm · Xếp hạng), không
 * còn "mỗi phân hệ một thẻ + hai nút [Tạo][Xem]", không còn thẻ giữ chỗ "Nhóm chat gần đây". Ô ẩn theo vai trò và cờ phân hệ; bấm
 * cả ô là mở màn đích. Số thành viên nói MỘT lần, ở đầu trang (ô "Thành viên" không lặp lại con số).
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws-1' }),
}));
jest.mock('../queries/workspaces.queries', () => ({ useWorkspaceOverview: jest.fn() }));
jest.mock('../hooks/useOnboardingChecklist', () => ({
  useOnboardingChecklist: () => ({ visible: false, steps: [], dismiss: jest.fn(), openStep: jest.fn() }),
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));

const mockedOverview = jest.mocked(useWorkspaceOverview);

function mockOverview(myRole: WorkspaceRole, description: string | null = null): void {
  mockedOverview.mockReturnValue({
    data: {
      memberCount: 12,
      workspace: {
        archivedReason: null,
        avatarUrl: null,
        description,
        myExpiresAt: null,
        myPermissions: { canCreateChannel: true, canInvite: true },
        myRole,
        name: 'Nhóm Toán 12',
        status: 'ACTIVE',
      },
    } as unknown as WorkspaceOverview,
    error: null,
    isError: false,
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useWorkspaceOverview>);
}

/** Bật đúng các cờ được nêu; cờ còn lại TẮT. */
function enable(...flags: string[]): void {
  jest.mocked(useFeature).mockImplementation((flag: string) => flags.includes(flag));
}

beforeEach(() => jest.clearAllMocks());

describe('WorkspaceOverviewScreen — khung lối vào', () => {
  it('thành viên, mọi cờ bật: đủ năm ô; số thành viên chỉ nói MỘT lần (ở đầu trang, ô "Thành viên" không lặp)', async () => {
    enable('meeting', 'wallet', 'gamification');
    mockOverview('MEMBER');

    await renderWithProviders(<WorkspaceOverviewScreen />);

    // Vai trò "Thành viên" cũng là chữ ở phần đầu, nên dòng lối vào nhận diện bằng mô tả của nó.
    for (const label of ['Kênh', 'Lịch họp', 'Ví nhóm', 'Xếp hạng']) expect(screen.getByText(label)).toBeOnTheScreen();
    // "12 thành viên" chỉ xuất hiện MỘT lần (getByText ném lỗi nếu có hai chỗ).
    expect(screen.getByText('12 thành viên')).toBeOnTheScreen();
  });

  it('bấm cả ô là mở đúng màn đích (không có nút "Tạo"/"Mời"/"Xem" cạnh từng ô)', async () => {
    enable('meeting', 'wallet', 'gamification');
    mockOverview('OWNER');
    await renderWithProviders(<WorkspaceOverviewScreen />);

    expect(screen.queryByText('Tạo')).toBeNull();
    expect(screen.queryByText('Mời')).toBeNull();
    expect(screen.queryByText('Xem')).toBeNull();

    await fireEvent.press(screen.getByText('Kênh'));
    expect(router.push).toHaveBeenLastCalledWith({ params: { wsId: 'ws-1' }, pathname: '/workspaces/[wsId]/channels' });

    await fireEvent.press(screen.getByText('Thành viên'));
    expect(router.push).toHaveBeenLastCalledWith({ params: { wsId: 'ws-1' }, pathname: '/workspaces/[wsId]/members' });

    await fireEvent.press(screen.getByText('Lịch họp'));
    expect(router.push).toHaveBeenLastCalledWith('/meetings');

    await fireEvent.press(screen.getByText('Ví nhóm'));
    expect(router.push).toHaveBeenLastCalledWith('/workspaces/ws-1/wallet');

    await fireEvent.press(screen.getByText('Xếp hạng'));
    expect(router.push).toHaveBeenLastCalledWith({ params: { wsId: 'ws-1' }, pathname: '/workspaces/[wsId]/leaderboard' });
  });

  it('cờ phân hệ TẮT hoặc CHƯA biết: ẩn Lịch họp / Ví nhóm / Xếp hạng, còn Kênh + Thành viên', async () => {
    mockOverview('MEMBER');

    for (const flag of [false, undefined]) {
      jest.mocked(useFeature).mockReturnValue(flag);
      await renderWithProviders(<WorkspaceOverviewScreen />);

      expect(screen.getByText('Kênh')).toBeOnTheScreen();
      expect(screen.getByText('12 thành viên')).toBeOnTheScreen();
      for (const label of ['Lịch họp', 'Ví nhóm', 'Xếp hạng']) expect(screen.queryByText(label)).toBeNull();
      await screen.unmount();
    }
  });

  it('khách (GUEST): chỉ còn dòng "Kênh" dù mọi cờ bật', async () => {
    enable('meeting', 'wallet', 'gamification');
    mockOverview('GUEST');

    await renderWithProviders(<WorkspaceOverviewScreen />);

    expect(screen.getByText('Kênh')).toBeOnTheScreen();
    for (const label of ['Thành viên', 'Lịch họp', 'Ví nhóm', 'Xếp hạng']) expect(screen.queryByText(label)).toBeNull();
    expect(screen.queryByText('12 thành viên')).toBeNull();
  });

  it('không còn thẻ giữ chỗ "Nhóm chat gần đây"; mô tả nhóm (nếu có) hiện ở phần đầu', async () => {
    enable();
    mockOverview('MEMBER', 'Ôn thi tốt nghiệp môn Toán');

    await renderWithProviders(<WorkspaceOverviewScreen />);

    expect(screen.queryByText('Nhóm chat gần đây')).toBeNull();
    expect(screen.queryByText(/p1-05/)).toBeNull();
    expect(screen.getByText('Ôn thi tốt nghiệp môn Toán')).toBeOnTheScreen();
  });
});
