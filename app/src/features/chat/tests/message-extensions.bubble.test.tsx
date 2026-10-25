import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  MessageExtensionScopeContext,
  registerMessageActionRows,
  registerMessageBubbleFooter,
  type MessageExtensionScope,
} from '@/shared/message-extensions';

import { makeMessage } from '../cache/apply-socket-event.fixtures';
import { MessageActionSheet } from '../components/actions/MessageActionSheet';
import { MessageBubble } from '../components/bubble/MessageBubble';

/**
 * Phía `chat` của khe mở rộng tin nhắn (p5-04): `MessageBubble` vẽ hàng phụ và `MessageActionSheet` vẽ dòng thao tác do feature
 * khác đăng ký — CHỈ khi đứng trong `ChatRoom` (có context phạm vi). Dùng renderer giả: `chat` không import feature nguồn.
 */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

const SCOPE: MessageExtensionScope = {
  canManage: true,
  postingPolicy: 'ADMINS_ONLY',
  scopeId: 'ch-1',
  scopeType: 'CHANNEL',
  workspaceId: 'ws-1',
};
const inRoom = (node: ReactNode) => (
  <MessageExtensionScopeContext.Provider value={SCOPE}>
    {node}
  </MessageExtensionScopeContext.Provider>
);

const noop = jest.fn();
const bubble = (message = makeMessage({}), isOwn = false) => (
  <MessageBubble grouped={false} isOwn={isOwn} item={{ kind: 'sent', message }} />
);
const sheet = (onClose = noop) => (
  <MessageActionSheet
    message={makeMessage({})}
    visible
    onClose={onClose}
    onEdit={noop}
    onForward={noop}
    onHide={noop}
    onPin={noop}
    onRecall={noop}
    onReply={noop}
    onToggleReaction={noop}
    onUnpin={noop}
  />
);

afterEach(() => {
  registerMessageBubbleFooter('t', null);
  registerMessageActionRows('t', null);
});

describe('MessageBubble — khe hàng phụ', () => {
  it('trong ChatRoom: renderer nhận đúng tin, isOwn và phạm vi kênh (kèm dữ kiện màn cha nạp)', async () => {
    const seen: { isOwn?: boolean; scope?: MessageExtensionScope } = {};
    registerMessageBubbleFooter('t', ({ isOwn, message, scope }) => {
      seen.isOwn = isOwn;
      seen.scope = scope;
      return <Text>{`footer ${message.id}`}</Text>;
    });

    await render(inRoom(bubble(makeMessage({}), true)));

    expect(screen.getByText('footer m-1')).toBeOnTheScreen();
    expect(seen.isOwn).toBe(true);
    expect(seen.scope).toMatchObject({
      canManage: true,
      postingPolicy: 'ADMINS_ONLY',
      scopeId: 'ch-1',
      workspaceId: 'ws-1',
    });
  });

  it('nội dung tin vẫn hiện nguyên (khe không thay bong bóng, chỉ thêm hàng phụ)', async () => {
    registerMessageBubbleFooter('t', () => <Text>footer</Text>);

    await render(inRoom(bubble()));

    expect(screen.getByText('xin chào')).toBeOnTheScreen();
    expect(screen.getByText('footer')).toBeOnTheScreen();
  });

  it('ngoài ChatRoom (không có context phạm vi) → không vẽ hàng phụ dù đã có renderer đăng ký', async () => {
    registerMessageBubbleFooter('t', () => <Text>footer</Text>);

    await render(bubble());

    expect(screen.queryByText('footer')).toBeNull();
    expect(screen.getByText('xin chào')).toBeOnTheScreen();
  });

  it('tin đã thu hồi → không có hàng phụ (chỉ dấu "đã thu hồi")', async () => {
    registerMessageBubbleFooter('t', () => <Text>footer</Text>);

    await render(
      inRoom(bubble(makeMessage({ deleted: true, deletedAt: '2026-09-18T01:00:00.000Z' }))),
    );

    expect(screen.queryByText('footer')).toBeNull();
  });
});

describe('MessageActionSheet — khe dòng thao tác', () => {
  it('trong ChatRoom: dòng do feature khác đăng ký hiện trong menu, và chạm `onDone` đóng menu', async () => {
    const onClose = jest.fn();
    registerMessageActionRows('t', ({ message, onDone }) => (
      <Text onPress={onDone}>{`Hàng thêm ${message.id}`}</Text>
    ));
    await render(inRoom(sheet(onClose)), { wrapper: Wrapper });

    await userEvent.press(screen.getByText('Hàng thêm m-1'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('các dòng có sẵn của menu vẫn còn nguyên (Sao chép, Ẩn phía tôi…) — khe chỉ CHÈN THÊM', async () => {
    registerMessageActionRows('t', () => <Text>Hàng thêm</Text>);
    await render(inRoom(sheet()), { wrapper: Wrapper });

    expect(screen.getByText('Sao chép')).toBeOnTheScreen();
    expect(screen.getByText('Ẩn phía tôi')).toBeOnTheScreen();
    expect(screen.getByText('Hàng thêm')).toBeOnTheScreen();
  });

  it('ngoài ChatRoom → không vẽ dòng nào của khe', async () => {
    registerMessageActionRows('t', () => <Text>Hàng thêm</Text>);
    await render(sheet(), { wrapper: Wrapper });

    expect(screen.queryByText('Hàng thêm')).toBeNull();
    expect(screen.getByText('Sao chép')).toBeOnTheScreen();
  });
});
