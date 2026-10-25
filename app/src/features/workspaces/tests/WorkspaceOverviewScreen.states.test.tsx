import { fireEvent, screen } from '@testing-library/react-native';
import { AxiosError, AxiosHeaders } from 'axios';
import { router } from 'expo-router';

import type { WorkspaceOverview, WorkspaceRole } from '../api';
import { useWorkspaceOverview } from '../queries/workspaces.queries';
import { WorkspaceOverviewScreen } from '../screens/WorkspaceOverviewScreen';

import { renderWithProviders } from './test-utils';

/**
 * Trạng thái của tổng quan nhóm:
 *  · Lượt tải LẠI hỏng (mạng/5xx) khi đã có dữ liệu ⇒ GIỮ nội dung (cache phiên) — trước đây cả màn thành "Mất kết nối".
 *  · 403/404 (mất quyền/nhóm đã xoá) ⇒ khối "Không mở được nhóm" kể cả khi còn cache.
 *  · Chưa có dữ liệu mà lỗi mạng ⇒ "Mất kết nối" + "Thử lại".
 *  · "Mời thành viên" ở đầu trang: chỉ OWNER/ADMIN của nhóm còn hoạt động; bấm mở màn mời.
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

function networkError(): AxiosError {
  return new AxiosError('Network Error', 'ERR_NETWORK', { headers: new AxiosHeaders() });
}

function httpError(status: number): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, {
    config,
    data: {},
    headers: {},
    status,
    statusText: '',
  });
}

interface MockState {
  error?: unknown;
  hasData?: boolean;
  myRole?: WorkspaceRole;
  status?: 'ACTIVE' | 'ARCHIVED';
}

function mockOverview({
  error = null,
  hasData = true,
  myRole = 'OWNER',
  status = 'ACTIVE',
}: MockState = {}): void {
  jest.mocked(useWorkspaceOverview).mockReturnValue({
    data: hasData
      ? ({
          memberCount: 12,
          workspace: {
            archivedReason: null,
            avatarUrl: null,
            description: null,
            myExpiresAt: null,
            myPermissions: { canCreateChannel: true, canInvite: true },
            myRole,
            name: 'Nhóm Toán 12',
            status,
          },
        } as unknown as WorkspaceOverview)
      : undefined,
    error,
    isError: error !== null,
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useWorkspaceOverview>);
}

beforeEach(() => jest.clearAllMocks());

describe('WorkspaceOverviewScreen — lỗi tải', () => {
  it('đã có dữ liệu mà lượt tải lại mất mạng ⇒ vẫn hiện nội dung, KHÔNG thay bằng "Mất kết nối"', async () => {
    mockOverview({ error: networkError() });

    await renderWithProviders(<WorkspaceOverviewScreen />);

    expect(screen.getByRole('header', { name: 'Nhóm Toán 12' })).toBeOnTheScreen();
    expect(screen.getByText('Lối vào nhanh')).toBeOnTheScreen();
    expect(screen.queryByText('Mất kết nối')).toBeNull();
  });

  it('đã có dữ liệu mà lượt tải lại lỗi máy chủ (5xx) ⇒ vẫn hiện nội dung', async () => {
    mockOverview({ error: httpError(500) });

    await renderWithProviders(<WorkspaceOverviewScreen />);

    expect(screen.getByText('Lối vào nhanh')).toBeOnTheScreen();
    expect(screen.queryByText('Không tải được')).toBeNull();
  });

  it.each([403, 404])('HTTP %s (mất quyền) ⇒ "Không mở được nhóm" dù còn cache', async (status) => {
    mockOverview({ error: httpError(status) });

    await renderWithProviders(<WorkspaceOverviewScreen />);

    expect(screen.getByText('Không mở được nhóm')).toBeOnTheScreen();
    expect(screen.queryByText('Lối vào nhanh')).toBeNull();
  });

  it('chưa có dữ liệu mà mất mạng ⇒ "Mất kết nối" + "Thử lại"', async () => {
    mockOverview({ error: networkError(), hasData: false });

    await renderWithProviders(<WorkspaceOverviewScreen />);

    expect(screen.getByText('Mất kết nối')).toBeOnTheScreen();
    expect(screen.getByText('Thử lại')).toBeOnTheScreen();
  });
});

describe('WorkspaceOverviewScreen — "Mời thành viên" ở đầu trang', () => {
  it.each(['OWNER', 'ADMIN'] as const)('%s ⇒ có nút, bấm mở màn mời của nhóm', async (myRole) => {
    mockOverview({ myRole });

    await renderWithProviders(<WorkspaceOverviewScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Mời thành viên' }));

    expect(router.push).toHaveBeenLastCalledWith({
      params: { wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/invite',
    });
  });

  it.each(['MEMBER', 'GUEST'] as const)(
    '%s ⇒ không có nút (màn mời chỉ dành cho quản trị)',
    async (myRole) => {
      mockOverview({ myRole });

      await renderWithProviders(<WorkspaceOverviewScreen />);

      expect(screen.queryByText('Mời thành viên')).toBeNull();
    },
  );

  it('nhóm đã lưu trữ ⇒ không có nút, kể cả chủ nhóm', async () => {
    mockOverview({ status: 'ARCHIVED' });

    await renderWithProviders(<WorkspaceOverviewScreen />);

    expect(screen.getByText('Nhóm đã lưu trữ')).toBeOnTheScreen();
    expect(screen.queryByText('Mời thành viên')).toBeNull();
  });
});
