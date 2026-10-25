import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { WorkspaceOverview } from '../api';
import { useWorkspaceOverview } from '../queries/workspaces.queries';
import { WorkspaceOverviewScreen } from '../screens/WorkspaceOverviewScreen';

import { renderWithProviders } from './test-utils';

/**
 * Hub nhóm với các mục phân hệ khác (p3-01 Tài liệu, p3-02 Việc) — `workspaces` KHÔNG import
 * chéo feature, nên các mục vào qua slot `extraSections` do file route truyền. Khoá hai điều:
 * (1) slot được vẽ; (2) khách (GUEST) không thấy khối "Thành viên" và số thành viên (BE có thể
 * không gửi, và khách không có lối vào danh bạ).
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws-1' }),
}));
jest.mock('../queries/workspaces.queries', () => ({ useWorkspaceOverview: jest.fn() }));
jest.mock('../hooks/useOnboardingChecklist', () => ({
  useOnboardingChecklist: () => ({ visible: false, steps: [], dismiss: jest.fn(), openStep: jest.fn() }),
}));
// Ví nhóm (p6-04) tự ẩn theo cờ — ở đây không liên quan.
jest.mock('@/shell/capabilities', () => ({ useFeature: () => false }));

const mockedOverview = jest.mocked(useWorkspaceOverview);

function mockOverview(myRole: 'ADMIN' | 'GUEST' | 'MEMBER' | 'OWNER'): void {
  mockedOverview.mockReturnValue({
    data: {
      memberCount: 12,
      workspace: {
        archivedReason: null,
        avatarUrl: null,
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

describe('WorkspaceOverviewScreen — hub với mục phân hệ khác', () => {
  it('thành viên thường: vẽ mục do route truyền vào (slot) và khối Thành viên', async () => {
    mockOverview('MEMBER');

    await renderWithProviders(<WorkspaceOverviewScreen extraSections={<Text>MỤC-PHÂN-HỆ-KHÁC</Text>} />);

    expect(screen.getByText('MỤC-PHÂN-HỆ-KHÁC')).toBeTruthy();
    expect(screen.getByText('12 thành viên')).toBeTruthy();
  });

  it('khách (GUEST): ẩn khối Thành viên + số thành viên và nút Tạo kênh; vẫn vẽ slot (mục tự ẩn theo vai trò)', async () => {
    mockOverview('GUEST');

    await renderWithProviders(<WorkspaceOverviewScreen extraSections={<Text>MỤC-PHÂN-HỆ-KHÁC</Text>} />);

    expect(screen.queryByText('12 thành viên')).toBeNull();
    expect(screen.queryByText('Mời')).toBeNull();
    expect(screen.queryByText('Tạo')).toBeNull();
    expect(screen.getByText('MỤC-PHÂN-HỆ-KHÁC')).toBeTruthy();
  });

  it('không truyền slot: hub vẫn vẽ bình thường', async () => {
    mockOverview('OWNER');

    await renderWithProviders(<WorkspaceOverviewScreen />);

    expect(screen.getByText('12 thành viên')).toBeTruthy();
  });
});
