import { screen } from '@testing-library/react-native';

import { MemberListScreen } from '../screens/MemberListScreen';
import { useWorkspaceAccess } from '../queries/guests.queries';
import { useMembers } from '../queries/members.queries';
import { renderWithProviders } from './test-utils';

/**
 * Màn Thành viên theo QUYỀN: nút "Mời thành viên" ở AppBar và chip "Bị chặn" chỉ hiện khi dùng được (thành viên thường vào nút mời
 * chỉ nhận 403 của BE; xem danh sách bị chặn cũng 403). Quyền THẬT vẫn do BE — test này chỉ khoá phần ẩn/hiện.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws-1' }),
}));
jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('../hooks/useMemberSocket', () => ({ useMemberSocket: jest.fn() }));
jest.mock('../queries/guests.queries', () => ({
  ...jest.requireActual('../queries/guests.queries'),
  useWorkspaceAccess: jest.fn(),
}));
jest.mock('../queries/members.queries', () => ({
  ...jest.requireActual('../queries/members.queries'),
  useMembers: jest.fn(),
}));
jest.mock('../queries/join-requests.queries', () => ({
  ...jest.requireActual('../queries/join-requests.queries'),
  useJoinRequests: () => ({ data: undefined }),
}));

const mockedAccess = jest.mocked(useWorkspaceAccess);
const mockedMembers = jest.mocked(useMembers);

function access(patch: { canInviteByEmail: boolean; canManageMembers: boolean }): void {
  mockedAccess.mockReturnValue({
    data: { guestEnabled: false, isOwner: patch.canManageMembers, joinPolicy: 'OPEN', myRole: 'MEMBER', ...patch },
  } as unknown as ReturnType<typeof useWorkspaceAccess>);
}

function members(items: unknown[]): void {
  mockedMembers.mockReturnValue({
    data: { pages: [{ items, meta: { hasMore: false, limit: 20, nextCursor: null, total: items.length } }] },
    error: null,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useMembers>);
}

beforeEach(() => {
  jest.clearAllMocks();
  members([]);
});

describe('MemberListScreen — theo quyền', () => {
  it('thành viên thường (không mời được): không có nút mời, không có chip "Bị chặn", trạng thái rỗng không mời chào', async () => {
    access({ canInviteByEmail: false, canManageMembers: false });
    await renderWithProviders(<MemberListScreen />);

    expect(screen.queryByRole('button', { name: 'Mời thành viên' })).toBeNull();
    expect(screen.queryByText('Bị chặn')).toBeNull();
    expect(screen.queryByText('Mời thành viên')).toBeNull();
    expect(screen.getByText('Chỉ có bạn trong nhóm')).toBeOnTheScreen();
  });

  it('MEMBER được phép mời qua email: có nút mời, vẫn KHÔNG có chip "Bị chặn"', async () => {
    access({ canInviteByEmail: true, canManageMembers: false });
    await renderWithProviders(<MemberListScreen />);

    expect(screen.getAllByRole('button', { name: 'Mời thành viên' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Bị chặn')).toBeNull();
  });

  it('OWNER/ADMIN: có nút mời và chip "Bị chặn"', async () => {
    access({ canInviteByEmail: true, canManageMembers: true });
    await renderWithProviders(<MemberListScreen />);

    expect(screen.getAllByRole('button', { name: 'Mời thành viên' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Bị chặn')).toBeOnTheScreen();
  });

  it('chưa biết quyền (đang tải): ẩn nút mời — không chớp hiện rồi biến', async () => {
    mockedAccess.mockReturnValue({ data: undefined } as unknown as ReturnType<typeof useWorkspaceAccess>);
    await renderWithProviders(<MemberListScreen />);

    expect(screen.queryByRole('button', { name: 'Mời thành viên' })).toBeNull();
    expect(screen.queryByText('Bị chặn')).toBeNull();
  });
});
