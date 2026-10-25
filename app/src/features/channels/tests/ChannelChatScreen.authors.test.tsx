import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { ChatRoomProps } from '@/features/chat';
import { useAuthStore } from '@/shell/store/slices/auth';

import { channelsService, type ChannelDetail } from '../api';
import { ChannelChatScreen } from '../screens/ChannelChatScreen';

/**
 * Chốt lỗi p1-03: `ChannelChatScreen` không truyền `resolveAuthor` cho `ChatRoom`
 * nên MỌI bong bóng hiện tên "Thành viên". Test bắt đúng props mà màn đưa cho
 * `ChatRoom` (`chat` là feature nền, tự nó không biết tên ai).
 */

let chatRoomProps: ChatRoomProps | undefined;

jest.mock('@/features/chat', () => ({
  ChatRoom: (props: ChatRoomProps) => {
    chatRoomProps = props;
    return null;
  },
  useChatScope: () => ({ scopeType: 'CHANNEL', scopeId: 'ch-1' }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  // `m` = deep link `/w/{wsId}/c/{chId}?m={messageId}`.
  useLocalSearchParams: () => ({ chId: 'ch-1', wsId: 'ws-1', m: 'msg-9' }),
}));
jest.mock('../hooks/useChannelScope', () => ({
  useChannelScope: () => ({ channel: mockChannel, error: null, isLoading: false, status: 'joined' }),
}));

const mockChannel: ChannelDetail = {
  id: 'ch-1',
  name: 'chung',
  type: 'TEXT',
  visibility: 'PUBLIC',
  postingPolicy: 'MEMBERS',
  status: 'ACTIVE',
  isDefault: true,
  pinned: false,
  position: 0,
  notifyMode: 'INHERIT',
  lastMessageAt: null,
  description: null,
  memberCount: 2,
  createdBy: 'u-1',
  version: 1,
  myPermissions: {
    canWrite: true,
    canReact: true,
    canPin: false,
    canModerate: false,
    canManage: false,
    canArchive: false,
    canManageGrants: false,
    canLeave: true,
  },
};

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

async function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  await render(<ChannelChatScreen />, { wrapper: Wrapper });
}

describe('ChannelChatScreen — tên tác giả', () => {
  beforeEach(() => {
    chatRoomProps = undefined;
    useAuthStore.setState({ user: null });
  });

  it('truyền resolveAuthor dựng từ GET /channels/:id/members (mọi trang) và initialMessageId từ ?m=', async () => {
    const members = jest.spyOn(channelsService, 'members');
    members
      .mockResolvedValueOnce({
        items: [{ userId: 'u-1', name: 'Nguyễn Văn An', avatarUrl: null, presence: 'ONLINE' }],
        meta: { page: 1, limit: 100, total: 2, totalPages: 2, hasNext: true, hasPrev: false },
      })
      .mockResolvedValueOnce({
        items: [{ userId: 'u-2', name: 'Trần Thị Bình', avatarUrl: null, presence: 'OFFLINE' }],
        meta: { page: 2, limit: 100, total: 2, totalPages: 2, hasNext: false, hasPrev: true },
      });

    await renderScreen();

    expect(chatRoomProps?.initialMessageId).toBe('msg-9');
    expect(chatRoomProps?.resolveAuthor).toBeDefined();

    // Kéo hết cả hai trang (không chỉ trang đầu) rồi mới đủ tên.
    await waitFor(() => expect(chatRoomProps?.resolveAuthor?.('u-2')?.name).toBe('Trần Thị Bình'));
    expect(chatRoomProps?.resolveAuthor?.('u-1')?.name).toBe('Nguyễn Văn An');
    expect(members).toHaveBeenNthCalledWith(1, 'ch-1', 1, undefined, 100);
    expect(members).toHaveBeenNthCalledWith(2, 'ch-1', 2, undefined, 100);

    members.mockRestore();
  });
});
