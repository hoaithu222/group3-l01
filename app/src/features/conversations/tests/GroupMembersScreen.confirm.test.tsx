import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { GroupMembersScreen } from '../screens/GroupMembersScreen';

/**
 * Chuyển quyền chủ nhóm / xoá thành viên là thao tác KHÔNG hoàn tác được: chạm dòng trong menu thành viên chỉ mở tấm xác nhận,
 * chỉ khi bấm nút xác nhận mới gọi API. Bản cũ gọi API ngay khi chạm — bấm nhầm là mất quyền chủ nhóm.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ conversationId: 'c-1' }),
}));
jest.mock('@/core/socket', () => ({ usePresence: () => ({ state: 'OFFLINE', updatedAt: 0 }) }));
jest.mock('@/shell/store/slices/auth', () => ({
  useAuthStore: (selector: (s: { user: { id: string } }) => unknown) => selector({ user: { id: 'u-me' } }),
}));
jest.mock('@/shared/hooks/useModerationActions', () => ({
  useModerationActions: () => ({ blockUser: jest.fn(), reportUser: jest.fn(), unblockUser: jest.fn() }),
}));
jest.mock('@/shared/hooks/useBlockedIds', () => ({ useIsUserBlocked: () => false }));

const mockRemove = jest.fn();
const mockTransfer = jest.fn();
jest.mock('../hooks/useMemberActions', () => ({
  useMemberActions: () => ({
    changeRole: { mutate: jest.fn() },
    removeMember: { isPending: false, mutate: mockRemove },
    transferOwner: { isPending: false, mutate: mockTransfer },
  }),
}));
jest.mock('../hooks/useConversationDetail', () => ({
  useConversationDetail: () => ({
    data: {
      myPermissions: { canChangeRoles: true, canRemoveMembers: true, canTransfer: true },
      myRole: 'OWNER',
    },
  }),
}));

jest.mock('../hooks/useGroupMembers', () => ({
  useGroupMembers: () => ({
    data: { pages: [{ data: [{ avatarUrl: null, name: 'An', presence: 'OFFLINE', role: 'MEMBER', userId: 'u-an' }] }] },
    error: null,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
function Wrapper({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

async function openMenuOfAn(): Promise<void> {
  await render(<GroupMembersScreen />, { wrapper: Wrapper });
  await fireEvent.press(await screen.findByRole('button', { name: 'An' }));
}

describe('GroupMembersScreen — xác nhận trước thao tác không hoàn tác', () => {
  it('chạm "Chuyển quyền chủ nhóm" chỉ mở tấm xác nhận; bấm "Chuyển quyền" mới gọi API', async () => {
    await openMenuOfAn();

    await fireEvent.press(await screen.findByRole('button', { name: 'Chuyển quyền chủ nhóm' }));

    expect(await screen.findByText('Chuyển quyền chủ nhóm cho An?')).toBeOnTheScreen();
    expect(mockTransfer).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Chuyển quyền' }));
    await waitFor(() => expect(mockTransfer).toHaveBeenCalledWith('u-an', expect.anything()));
  });

  it('chạm "Xoá khỏi nhóm" chỉ mở tấm xác nhận; "Huỷ" thì không xoá', async () => {
    await openMenuOfAn();

    await fireEvent.press(await screen.findByRole('button', { name: 'Xoá khỏi nhóm' }));

    expect(await screen.findByText('Xoá An khỏi nhóm?')).toBeOnTheScreen();
    expect(mockRemove).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Huỷ' }));
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
