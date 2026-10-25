import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { WorkspaceOverview, WorkspaceRole } from '../api';
import { useWorkspaceOverview } from '../queries/workspaces.queries';
import { WorkspaceOverviewScreen } from '../screens/WorkspaceOverviewScreen';

import { renderWithProviders } from './test-utils';

/**
 * Slot `guestBanners` (p6-03: banner cố vấn): CHỈ vẽ khi người xem là KHÁCH — nhờ vậy component truyền vào (tự gọi API) không tốn request nào với
 * thành viên thường. `workspaces` không import `mentor`, tầng route ghép.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws-1' }),
}));
jest.mock('../queries/workspaces.queries', () => ({ useWorkspaceOverview: jest.fn() }));
jest.mock('../hooks/useOnboardingChecklist', () => ({
  useOnboardingChecklist: () => ({
    visible: false,
    steps: [],
    dismiss: jest.fn(),
    openStep: jest.fn(),
  }),
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => false }));

function mockOverview(myRole: WorkspaceRole): void {
  jest.mocked(useWorkspaceOverview).mockReturnValue({
    data: {
      memberCount: 12,
      workspace: {
        archivedReason: null,
        avatarUrl: null,
        description: null,
        myExpiresAt: null,
        myPermissions: { canCreateChannel: false, canInvite: false },
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

describe('WorkspaceOverviewScreen — guestBanners', () => {
  it('KHÁCH: vẽ banner do route ghép', async () => {
    mockOverview('GUEST');
    await renderWithProviders(
      <WorkspaceOverviewScreen guestBanners={<Text>BANNER-CỐ-VẤN</Text>} />,
    );

    expect(screen.getByText('BANNER-CỐ-VẤN')).toBeOnTheScreen();
  });

  it('thành viên thường / quản trị / chủ nhóm: KHÔNG vẽ (và component không được dựng)', async () => {
    for (const role of ['MEMBER', 'ADMIN', 'OWNER'] as const) {
      mockOverview(role);
      await renderWithProviders(
        <WorkspaceOverviewScreen guestBanners={<Text>BANNER-CỐ-VẤN</Text>} />,
      );

      expect(screen.queryByText('BANNER-CỐ-VẤN')).toBeNull();
      await screen.unmount();
    }
  });
});
