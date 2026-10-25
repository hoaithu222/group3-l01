import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  registerChatRoomHost,
  registerComposerTop,
  type ChatRoomHostProps,
  type MessageExtensionFacts,
  type MessageExtensionScope,
} from '@/shared/message-extensions';

import type { ChatScopeRef } from '../api/chat.types';
import { ChatRoom } from '../components/ChatRoom';

/**
 * `ChatRoom` (p5-04): cấp phạm vi cho khe mở rộng — `scope` (của chat) + dữ kiện ĐẶC THÙ KÊNH mà màn cha nạp qua `extension`
 * (`chat` không tự suy quyền quản lý/chính sách đăng bài) — và dựng khe `roomHost` MỘT lần. Cùng cách dựng với
 * `chat-room-thread.test.tsx`: giả các phần con nặng, chỉ giữ ChatRoom thật.
 */
const captured: { host?: ChatRoomHostProps; listScope?: MessageExtensionScope | null } = {};

jest.mock('../components/useChatRoomState', () => ({
  useChatRoomState: () => ({
    query: { hasNextPage: false, hasPreviousPage: false, isError: false, isLoading: false },
    rows: [{ key: 'm-1', type: 'bubble' }],
    currentUserId: 'me',
    scrollAnchor: {
      listRef: { current: null },
      newCount: 0,
      onScroll: jest.fn(),
      scrollToBottom: jest.fn(),
    },
    highlightId: undefined,
    findMessage: jest.fn(),
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
// `MessageList` giả đọc context như `MessageBubble` thật: chứng minh ChatRoom đã bọc Provider quanh cả danh sách tin.
// (Factory của jest.mock không được tham chiếu biến ngoài phạm vi → `require` bên trong; ghi kết quả vào `captured`.)
jest.mock('../components/list/MessageList', () => {
  const actual = jest.requireActual('@/shared/message-extensions');
  return {
    MessageList: () => {
      captured.listScope = actual.useMessageExtensionScope();
      return null;
    },
    MessageListSkeleton: () => null,
  };
});
jest.mock('../components/actions/MessageActionSheet', () => ({ MessageActionSheet: () => null }));
jest.mock('../components/composer/Composer', () => ({ Composer: () => null }));
jest.mock('../components/list/NewMessagesPill', () => ({ NewMessagesPill: () => null }));
jest.mock('../components/list/TypingRow', () => ({ TypingRow: () => null }));
jest.mock('../components/forward/ForwardSheet', () => ({ ForwardSheet: () => null }));
jest.mock('../components/actions/WhoReactedSheet', () => ({ WhoReactedSheet: () => null }));
jest.mock('../components/actions/EmojiPickerSheet', () => ({ EmojiPickerSheet: () => null }));

const CHANNEL: ChatScopeRef = { scopeId: 'ch-1', scopeType: 'CHANNEL' };
const FACTS: MessageExtensionFacts = {
  canManage: true,
  postingPolicy: 'ADMINS_ONLY',
  workspaceId: 'ws-1',
};

async function mount(scope: ChatScopeRef, extension?: MessageExtensionFacts) {
  captured.host = undefined;
  captured.listScope = undefined;
  await render(
    <ChatRoom capabilities={{ canWrite: true }} emptyHint="" extension={extension} scope={scope} />,
  );
}

beforeEach(() => {
  registerChatRoomHost('t', (props) => {
    captured.host = props;
    return <Text>host</Text>;
  });
});
afterEach(() => registerChatRoomHost('t', null));

describe('ChatRoom — khe roomHost và context phạm vi', () => {
  it('dựng host đã đăng ký và đưa đúng phạm vi: scope của chat + dữ kiện kênh màn cha nạp', async () => {
    await mount(CHANNEL, FACTS);

    expect(screen.getByText('host')).toBeOnTheScreen();
    expect(captured.host?.scope).toMatchObject({
      canManage: true,
      postingPolicy: 'ADMINS_ONLY',
      scopeId: 'ch-1',
      scopeType: 'CHANNEL',
      workspaceId: 'ws-1',
    });
  });

  it('màn cha không nạp `extension` (hội thoại, luồng…) → các dữ kiện kênh vắng mặt (khe coi như không áp dụng)', async () => {
    await mount({ scopeId: 'c-1', scopeType: 'CONVERSATION' });

    expect(captured.host?.scope).toMatchObject({ scopeId: 'c-1', scopeType: 'CONVERSATION' });
    expect(captured.host?.scope.canManage).toBeUndefined();
    expect(captured.host?.scope.postingPolicy).toBeUndefined();
    expect(captured.host?.scope.workspaceId).toBeUndefined();
  });

  it('màn luồng: `threadId` của scope được giữ để khe biết đây không phải luồng chính', async () => {
    await mount({ scopeId: 'ch-1', scopeType: 'CHANNEL', threadId: 'root-1' }, FACTS);

    expect(captured.host?.scope.threadId).toBe('root-1');
  });

  it('danh sách tin nằm TRONG Provider: bong bóng đọc được phạm vi qua context', async () => {
    await mount(CHANNEL, FACTS);

    expect(captured.listScope).toMatchObject({
      canManage: true,
      scopeId: 'ch-1',
      scopeType: 'CHANNEL',
    });
  });
});

describe('ChatRoom — khe composerTop (p7-04)', () => {
  afterEach(() => registerComposerTop('t', null));

  it('vẽ khe NGAY trên ô soạn với đúng phạm vi (banner "N tin đã hẹn"); chưa đăng ký → không vẽ gì', async () => {
    await mount(CHANNEL, FACTS);
    expect(screen.queryByText('banner')).toBeNull();

    registerComposerTop('t', ({ scope }) => <Text>{`banner ${scope.scopeId}`}</Text>);
    await mount(CHANNEL, FACTS);

    expect(screen.getByText('banner ch-1')).toBeOnTheScreen();
  });
});
