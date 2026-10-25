import { render } from '@testing-library/react-native';

import type { ChatScopeRef, MessageView } from '../api/chat.types';
import { ChatRoom } from '../components/ChatRoom';

/**
 * Quy tắc "luồng chỉ ở KÊNH, luồng chính" (BE: hội thoại → MSG_018, luồng lồng → MSG_019): `ChatRoom` phải tự
 * gạt `onOpenThread` ở hội thoại và bên trong màn luồng dù màn cha có truyền — UI không được mời người dùng
 * làm điều server chắc chắn từ chối. Test bắt đúng thứ `ChatRoom` đưa cho `MessageList`/`MessageActionSheet`.
 */
const mockJumpTo = jest.fn();
const captured: {
  list?: { onOpenThread?: unknown };
  sheet?: { onOpenThread?: unknown; onMoreReactions?: unknown };
  pinned?: { onJump?: unknown; onOpenList?: unknown };
} = {};

jest.mock('../components/useChatRoomState', () => ({
  useChatRoomState: () => ({
    query: {
      isLoading: false,
      isError: false,
      hasNextPage: false,
      hasPreviousPage: false,
      messages: [{ id: 'm-1' }],
    },
    rows: [{ type: 'bubble', key: 'm-1' }],
    currentUserId: 'me',
    scrollAnchor: {
      listRef: { current: null },
      onScroll: jest.fn(),
      newCount: 0,
      scrollToBottom: jest.fn(),
    },
    highlightId: undefined,
    findMessage: jest.fn(),
    jumpTo: mockJumpTo,
    handlers: { onOpenActions: jest.fn() },
    actionMessage: undefined,
    setActionMessage: jest.fn(),
    actions: { onMoreReactions: jest.fn(), onToggleReaction: jest.fn() },
    forwardMessage: undefined,
    setForwardMessage: jest.fn(),
    whoReacted: undefined,
    setWhoReacted: jest.fn(),
    emojiPickerMessage: undefined,
    setEmojiPickerMessage: jest.fn(),
    listReactors: jest.fn(),
    draftRestoreNonce: 0,
  }),
}));
jest.mock('../components/list/MessageList', () => ({
  MessageList: (props: { onOpenThread?: unknown }) => {
    captured.list = props;
    return null;
  },
  MessageListSkeleton: () => null,
}));
jest.mock('../components/actions/MessageActionSheet', () => ({
  MessageActionSheet: (props: { onOpenThread?: unknown; onMoreReactions?: unknown }) => {
    captured.sheet = props;
    return null;
  },
}));
jest.mock('../components/pinned/PinnedBar', () => ({
  PinnedBar: (props: { onJump?: unknown; onOpenList?: unknown }) => {
    captured.pinned = props;
    return null;
  },
}));
jest.mock('../components/composer/Composer', () => ({ Composer: () => null }));
jest.mock('../components/list/NewMessagesPill', () => ({ NewMessagesPill: () => null }));
jest.mock('../components/list/TypingRow', () => ({ TypingRow: () => null }));
jest.mock('../components/forward/ForwardSheet', () => ({ ForwardSheet: () => null }));
jest.mock('../components/actions/WhoReactedSheet', () => ({ WhoReactedSheet: () => null }));
jest.mock('../components/actions/EmojiPickerSheet', () => ({ EmojiPickerSheet: () => null }));

async function mount(scope: ChatScopeRef, onOpenThread?: (m: MessageView) => void, onOpenPinned?: () => void) {
  captured.list = undefined;
  captured.sheet = undefined;
  captured.pinned = undefined;
  await render(
    <ChatRoom
      capabilities={{ canWrite: true }}
      emptyHint=""
      scope={scope}
      onOpenPinned={onOpenPinned}
      onOpenThread={onOpenThread}
    />,
  );
}

describe('ChatRoom — luồng chỉ ở kênh, luồng chính', () => {
  const onOpenThread = jest.fn();

  it('kênh (luồng chính) + màn cha nối điều hướng → hàng tóm tắt và mục "Trả lời trong luồng" có nút mở', async () => {
    await mount({ scopeType: 'CHANNEL', scopeId: 'ch-1' }, onOpenThread);
    expect(captured.list?.onOpenThread).toBe(onOpenThread);
    expect(captured.sheet?.onOpenThread).toBe(onOpenThread);
  });

  it('hội thoại: bị gạt dù màn cha truyền (server trả MSG_018)', async () => {
    await mount({ scopeType: 'CONVERSATION', scopeId: 'c-1' }, onOpenThread);
    expect(captured.list?.onOpenThread).toBeUndefined();
    expect(captured.sheet?.onOpenThread).toBeUndefined();
  });

  it('bên trong màn luồng: không luồng lồng luồng (server trả MSG_019)', async () => {
    await mount({ scopeType: 'CHANNEL', scopeId: 'ch-1', threadId: 'root-1' }, onOpenThread);
    expect(captured.list?.onOpenThread).toBeUndefined();
    expect(captured.sheet?.onOpenThread).toBeUndefined();
  });

  it('màn cha không nối điều hướng → không có luồng nào; nút "+" cảm xúc vẫn có ở mọi scope', async () => {
    await mount({ scopeType: 'CHANNEL', scopeId: 'ch-1' });
    expect(captured.list?.onOpenThread).toBeUndefined();
    expect(captured.sheet?.onMoreReactions).toBeDefined();
  });
});

/**
 * Thanh tin đã ghim (`PinnedBar`) chỉ dựng khi màn cha truyền `onOpenPinned` (cùng khuôn `onOpenThread`: không truyền ⇒ không có — luồng,
 * khung chat phòng họp). Chạm thanh phải đi vào ĐÚNG `jumpTo` của phòng (nhánh tin cũ mở lô `around` nằm ở đó), không phải bản riêng.
 */
describe('ChatRoom — thanh tin đã ghim', () => {
  it('có onOpenPinned → dựng PinnedBar, nối onJump vào jumpTo của phòng và onOpenList vào onOpenPinned', async () => {
    const onOpenPinned = jest.fn();
    await mount({ scopeType: 'CONVERSATION', scopeId: 'c-1' }, undefined, onOpenPinned);
    expect(captured.pinned?.onJump).toBe(mockJumpTo);
    expect(captured.pinned?.onOpenList).toBe(onOpenPinned);
  });

  it('không truyền onOpenPinned → không có thanh ghim', async () => {
    await mount({ scopeType: 'CONVERSATION', scopeId: 'c-1' });
    expect(captured.pinned).toBeUndefined();
  });
});
