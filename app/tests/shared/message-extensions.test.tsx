import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  ChatRoomHostSlot,
  MessageActionRowsSlot,
  MessageBubbleFooterSlot,
  MessageExtensionScopeContext,
  registerChatRoomHost,
  registerMessageActionRows,
  registerMessageBubbleFooter,
  useMessageExtensionScope,
  type MessageExtensionMessage,
  type MessageExtensionScope,
} from '@/shared/message-extensions';

/**
 * Khe mở rộng tin nhắn (p5-04): `chat` không import feature khác, nên feature nguồn (`announcements`) đăng ký renderer ở nơi
 * lắp ráp và `chat` chỉ vẽ ba khe — hàng phụ dưới bong bóng · dòng trong menu tin · host mỗi phòng chat.
 */
const message: MessageExtensionMessage = {
  authorId: 'u1',
  deleted: false,
  id: 'm-1',
  kind: 'USER',
  threadId: null,
};
const scope: MessageExtensionScope = { scopeId: 'ch-1', scopeType: 'CHANNEL' };

afterEach(() => {
  for (const id of ['a', 'b']) {
    registerMessageBubbleFooter(id, null);
    registerMessageActionRows(id, null);
    registerChatRoomHost(id, null);
  }
});

describe('khe mở rộng tin nhắn', () => {
  it('chưa đăng ký renderer nào (cờ tắt, test) ⇒ cả ba khe không vẽ gì', async () => {
    await render(
      <>
        <MessageBubbleFooterSlot isOwn={false} message={message} scope={scope} />
        <MessageActionRowsSlot message={message} scope={scope} onDone={jest.fn()} />
        <ChatRoomHostSlot scope={scope} />
      </>,
    );

    expect(screen.toJSON()).toBeNull();
  });

  it('renderer nhận đúng props của khe và nội dung được vẽ', async () => {
    const onDone = jest.fn();
    registerMessageBubbleFooter('a', ({ isOwn, message: m, scope: s }) => (
      <Text>{`footer ${m.id} ${s.scopeId} own=${String(isOwn)}`}</Text>
    ));
    registerMessageActionRows('a', ({ onDone: done }) => <Text onPress={done}>hàng thao tác</Text>);
    registerChatRoomHost('a', ({ scope: s }) => <Text>{`host ${s.scopeType}`}</Text>);

    await render(
      <>
        <MessageBubbleFooterSlot isOwn message={message} scope={scope} />
        <MessageActionRowsSlot message={message} scope={scope} onDone={onDone} />
        <ChatRoomHostSlot scope={scope} />
      </>,
    );

    expect(screen.getByText('footer m-1 ch-1 own=true')).toBeOnTheScreen();
    expect(screen.getByText('host CHANNEL')).toBeOnTheScreen();
    screen.getByText('hàng thao tác').props.onPress();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('nhiều feature cùng đăng ký ⇒ đều được vẽ; đăng ký lại cùng id chỉ GHI ĐÈ; null gỡ đăng ký', async () => {
    registerMessageBubbleFooter('a', () => <Text>từ A (cũ)</Text>);
    registerMessageBubbleFooter('a', () => <Text>từ A</Text>);
    registerMessageBubbleFooter('b', () => <Text>từ B</Text>);
    const { rerender } = await render(
      <MessageBubbleFooterSlot isOwn={false} message={message} scope={scope} />,
    );

    expect(screen.queryByText('từ A (cũ)')).toBeNull();
    expect(screen.getByText('từ A')).toBeOnTheScreen();
    expect(screen.getByText('từ B')).toBeOnTheScreen();

    registerMessageBubbleFooter('b', null);
    await rerender(<MessageBubbleFooterSlot isOwn={false} message={message} scope={scope} />);
    expect(screen.queryByText('từ B')).toBeNull();
    expect(screen.getByText('từ A')).toBeOnTheScreen();
  });

  it('renderer trả null (không thuộc về feature đó) ⇒ khe vẫn rỗng', async () => {
    registerMessageBubbleFooter('a', () => null);
    await render(<MessageBubbleFooterSlot isOwn={false} message={message} scope={scope} />);

    expect(screen.toJSON()).toBeNull();
  });
});

describe('useMessageExtensionScope', () => {
  function ScopeProbe() {
    const value = useMessageExtensionScope();
    return (
      <Text>
        {value ? `${value.scopeType}:${value.scopeId}:${String(value.canManage)}` : 'không có'}
      </Text>
    );
  }

  it('ngoài ChatRoom (test riêng lẻ) ⇒ null ⇒ bong bóng không vẽ khe nào', async () => {
    await render(<ScopeProbe />);
    expect(screen.getByText('không có')).toBeOnTheScreen();
  });

  it('trong ChatRoom ⇒ trả đúng phạm vi + dữ kiện đặc thù kênh', async () => {
    await render(
      <MessageExtensionScopeContext.Provider value={{ ...scope, canManage: true }}>
        <ScopeProbe />
      </MessageExtensionScopeContext.Provider>,
    );
    expect(screen.getByText('CHANNEL:ch-1:true')).toBeOnTheScreen();
  });
});
