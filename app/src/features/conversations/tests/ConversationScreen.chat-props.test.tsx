import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { ChatRoomProps } from '@/features/chat';
import { useAuthStore } from '@/shell/store/slices/auth';

import { conversationsService } from '../api/conversations.service';
import type { ConversationDetail } from '../api/conversations.types';
import { ConversationScreen } from '../screens/ConversationScreen';

/**
 * Chốt lỗi p1-05: `ConversationScreen` không truyền `resolveAuthor`/`searchForwardTargets`
 * cho chat engine ⇒ mọi bong bóng hiện "Thành viên" và ForwardSheet rỗng. Test bắt
 * đúng props mà màn đưa cho `ChatRoom` (`chat` là feature nền, tự nó không biết tên ai).
 */

let chatRoomProps: ChatRoomProps | undefined;
/** Đọc qua hàm: TS thu hẹp `chatRoomProps` thành `never` sau lần gán `= undefined` trong cùng test (biến này do mock ghi ở nơi khác). */
const latestChatRoomProps = (): ChatRoomProps | undefined => chatRoomProps;

jest.mock('@/features/chat', () => ({
  ChatRoom: (props: ChatRoomProps) => {
    chatRoomProps = props;
    return null;
  },
  useChatScope: () => ({ scopeType: 'CONVERSATION', scopeId: 'c-1' }),
  chatKeys: { scope: () => ['chat'] },
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ conversationId: 'c-1', m: 'msg-3' }),
}));
jest.mock('../hooks/useConversationScope', () => ({
  useConversationScope: () => ({ conversation: mockConversation, error: null, isLoading: false, status: 'joined' }),
}));
jest.mock('../hooks/useReadReceipts', () => ({ useReadReceipts: () => 0 }));
jest.mock('../components/ReadReceiptFooter', () => ({ ReadReceiptFooter: () => null }));
jest.mock('../api/conversations.service', () => ({
  conversationsService: { list: jest.fn(), listMembers: jest.fn() },
}));

const mockedList = jest.mocked(conversationsService.list);
const mockedListMembers = jest.mocked(conversationsService.listMembers);

let mockConversation: ConversationDetail;

function detail(overrides: Partial<ConversationDetail>): ConversationDetail {
  return {
    id: 'c-1',
    kind: 'GROUP',
    status: 'ACTIVE',
    title: 'Đồ án',
    peer: null,
    memberCount: 2,
    readOnly: false,
    readOnlyReason: null,
    myPermissions: { canSend: true },
    ...overrides,
  } as ConversationDetail;
}

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
  await render(<ConversationScreen />, { wrapper: Wrapper });
  // Đợi mọi query (danh sách thành viên…) xong trước khi test kết thúc — cập nhật state muộn ngoài `act` là cảnh báo và test sau dính lây.
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  // React Query báo observer qua `setTimeout(0)` — xả nó TRONG `act` để không rơi ra sau khi test kết thúc.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('ConversationScreen — props cho ChatRoom', () => {
  beforeEach(() => {
    chatRoomProps = undefined;
    mockedList.mockReset();
    mockedListMembers.mockReset();
    useAuthStore.setState({ user: null });
  });

  it('GROUP: resolveAuthor dựng từ thành viên nhóm; ?m= thành initialMessageId', async () => {
    mockConversation = detail({ kind: 'GROUP' });
    mockedListMembers.mockResolvedValue({
      data: [
        { userId: 'u-1', name: 'Nguyễn Văn An', avatarUrl: null, role: 'OWNER', joinedAt: '2026-09-01T00:00:00.000Z', presence: 'ONLINE' },
      ],
      meta: { nextCursor: null, hasMore: false, limit: 50 },
    });

    await renderScreen();

    expect(chatRoomProps?.initialMessageId).toBe('msg-3');
    await waitFor(() => expect(chatRoomProps?.resolveAuthor?.('u-1')?.name).toBe('Nguyễn Văn An'));
  });

  it('DIRECT: resolveAuthor tra được người kia từ `peer`, không cần gọi API thành viên', async () => {
    mockConversation = detail({
      kind: 'DIRECT',
      peer: { userId: 'u-2', name: 'Trần Thị Bình', avatarUrl: null, presence: 'OFFLINE' },
    });

    await renderScreen();

    expect(chatRoomProps?.resolveAuthor?.('u-2')?.name).toBe('Trần Thị Bình');
    expect(mockedListMembers).not.toHaveBeenCalled();
  });

  it('có searchForwardTargets — ForwardSheet của hội thoại có đích để chọn', async () => {
    mockConversation = detail({ kind: 'GROUP' });
    mockedListMembers.mockResolvedValue({ data: [], meta: { nextCursor: null, hasMore: false, limit: 50 } });
    mockedList.mockResolvedValue({
      data: [detail({ id: 'c-9', title: 'Nhóm khác' })],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    await renderScreen();

    expect(chatRoomProps?.searchForwardTargets).toBeDefined();
    const targets = await chatRoomProps?.searchForwardTargets?.('nhom');
    expect(targets).toEqual([{ scopeType: 'CONVERSATION', scopeId: 'c-9', label: 'Nhóm khác' }]);
  });

  it('p1-07: truyền mốc đã đọc lúc mở (knownLastReadSeq) và vá cache hàng danh sách khi server nhận mốc đọc', async () => {
    mockConversation = detail({ kind: 'GROUP', lastReadSeq: 7 } as Partial<ConversationDetail>);
    mockedListMembers.mockResolvedValue({ data: [], meta: { nextCursor: null, hasMore: false, limit: 50 } });

    await renderScreen();

    expect(chatRoomProps?.knownLastReadSeq).toBe(7);
    expect(chatRoomProps?.onMarkedRead).toBeDefined();
  });

  /**
   * ⛔ Chốt lỗi "ô soạn lơ lửng cách bàn phím": dải "Đã xem/Đã gửi" xếp DƯỚI `ChatRoom` thì ở lại chỗ cũ khi ô soạn nâng theo
   * bàn phím (transform) và thành khoảng trống bằng chiều cao của nó. Phải đi qua khe `belowList` — nằm giữa danh sách và ô soạn.
   */
  it('dải "Đã xem" đi vào khe `belowList` của ChatRoom khi được phép gửi; bị khoá thì không có', async () => {
    mockConversation = detail({ kind: 'GROUP', myPermissions: { canSend: true } } as Partial<ConversationDetail>);
    mockedListMembers.mockResolvedValue({ data: [], meta: { nextCursor: null, hasMore: false, limit: 50 } });
    await renderScreen();
    expect(latestChatRoomProps()?.belowList).toBeTruthy();

    chatRoomProps = undefined;
    mockConversation = detail({ kind: 'GROUP', myPermissions: { canSend: false } } as Partial<ConversationDetail>);
    await renderScreen();
    expect(latestChatRoomProps()?.belowList).toBeFalsy();
  });

  /** Thanh tin đã ghim (kiểu Zalo) do `ChatRoom` vẽ khi được truyền `onOpenPinned`; chạm "N ghim" mở màn danh sách `…/pins` của hội thoại này. */
  it('truyền onOpenPinned cho ChatRoom — chạm "N ghim" đẩy route danh sách ghim của ĐÚNG hội thoại', async () => {
    mockConversation = detail({ kind: 'GROUP' });
    mockedListMembers.mockResolvedValue({ data: [], meta: { nextCursor: null, hasMore: false, limit: 50 } });
    await renderScreen();

    expect(latestChatRoomProps()?.onOpenPinned).toBeDefined();
    latestChatRoomProps()?.onOpenPinned?.();
    expect(router.push).toHaveBeenCalledWith({ pathname: '/messages/[conversationId]/pins', params: { conversationId: 'c-1' } });
  });
});
