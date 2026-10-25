import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  MessageExtensionScopeContext,
  registerComposerAttachRows,
  registerMessageBody,
  type MessageExtensionScope,
} from '@/shared/message-extensions';

import { makeMessage } from '../cache/apply-socket-event.fixtures';
import { AttachMenuSheet } from '../components/composer/AttachMenuSheet';
import { ComposerAttachExtras } from '../components/composer/ComposerAttachExtras';
import { toDraftSnapshot } from '../components/composer/draft-snapshot';
import { MessageBubble } from '../components/bubble/MessageBubble';
import { previewText } from '../utils/preview-text';

/**
 * Phía `chat` của các khe MỚI (p7-04): `messageBody` (thân bong bóng khảo sát), `attachRows` (menu "+"), `composerTop` (ChatRoom) và bản chụp nháp cho "Hẹn giờ gửi". `chat` chỉ VẼ khe —
 * renderer ở đây là giả (không import `chat-extensions`, chiều ngược bị cấm). Chưa đăng ký ⇒ mọi thứ giữ nguyên hình dạng cũ.
 */
jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const METRICS = { frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 44 } };
const Wrapper = ({ children }: { children: ReactNode }) => <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
const SCOPE: MessageExtensionScope = { scopeId: 'ch-1', scopeType: 'CHANNEL' };
const inRoom = (node: ReactNode) => <MessageExtensionScopeContext.Provider value={SCOPE}>{node}</MessageExtensionScopeContext.Provider>;
const bubble = (message = makeMessage({}), isOwn = false) => (
  <MessageBubble grouped={false} isOwn={isOwn} item={{ kind: 'sent', message }} />
);

afterEach(() => {
  registerMessageBody('t', null);
  registerComposerAttachRows('t', null);
});

describe('MessageBubble — khe thân bong bóng (khảo sát)', () => {
  const poll = makeMessage({ content: 'Ăn gì trưa nay?', id: 'msg-poll', kind: 'POLL' });

  it('renderer nhận tin → thân bong bóng do nó vẽ THAY nội dung chữ', async () => {
    registerMessageBody('t', ({ message }) => (message.kind === 'POLL' ? <Text>thẻ khảo sát</Text> : null));

    await render(inRoom(bubble(poll)), { wrapper: Wrapper });

    expect(screen.getByText('thẻ khảo sát')).toBeOnTheScreen();
    expect(screen.queryByText('Ăn gì trưa nay?')).toBeNull();
  });

  it('renderer trả null (tin thường) → thân mặc định', async () => {
    registerMessageBody('t', () => null);

    await render(inRoom(bubble()), { wrapper: Wrapper });

    expect(screen.getByText('xin chào')).toBeOnTheScreen();
  });

  it('tin khảo sát đã THU HỒI → tombstone, không vẽ thẻ (renderer không được gọi cho tin đã thu hồi)', async () => {
    const renderer = jest.fn(() => <Text>thẻ khảo sát</Text>);
    registerMessageBody('t', renderer);

    await render(inRoom(bubble({ ...poll, deleted: true, deletedAt: '2026-09-27T00:00:00.000Z', content: null })), { wrapper: Wrapper });

    expect(screen.queryByText('thẻ khảo sát')).toBeNull();
    expect(renderer).not.toHaveBeenCalled();
  });

  it('đứng NGOÀI ChatRoom (không có phạm vi) → không gọi khe, thân mặc định', async () => {
    const renderer = jest.fn(() => <Text>thẻ khảo sát</Text>);
    registerMessageBody('t', renderer);

    await render(bubble(poll), { wrapper: Wrapper });

    expect(renderer).not.toHaveBeenCalled();
    expect(screen.getByText('Ăn gì trưa nay?')).toBeOnTheScreen();
  });

  it('chưa đăng ký khe nào → hình dạng cũ; nhãn trợ năng của tin khảo sát có tiền tố "[Khảo sát]"', async () => {
    await render(inRoom(bubble(poll)), { wrapper: Wrapper });

    expect(screen.getByLabelText(/\[Khảo sát\] Ăn gì trưa nay\?$/)).toBeOnTheScreen();
  });
});

describe('previewText — khảo sát', () => {
  it('"[Khảo sát] <câu hỏi>" khớp tiền tố BE; cắt theo grapheme; câu hỏi trống không để dư khoảng trắng', () => {
    expect(previewText(makeMessage({ content: 'Đi ăn ở đâu?', kind: 'POLL' }))).toBe('[Khảo sát] Đi ăn ở đâu?');
    expect(previewText(makeMessage({ content: 'x'.repeat(200), kind: 'POLL' }), 10)).toBe(`[Khảo sát] ${'x'.repeat(10)}…`);
    expect(previewText(makeMessage({ content: null, kind: 'POLL' }))).toBe('[Khảo sát]');
  });
});

describe('AttachMenuSheet — dòng thêm (extraRows)', () => {
  const handlers = { onClose: jest.fn(), onPickDocuments: jest.fn(), onPickImages: jest.fn(), onTakePhoto: jest.fn() };

  it('hiện SAU ba dòng có sẵn; không truyền → không đổi gì', async () => {
    await render(<AttachMenuSheet {...handlers} extraRows={<Text>Khảo sát</Text>} visible />, { wrapper: Wrapper });
    expect(screen.getByText('Khảo sát')).toBeOnTheScreen();
    expect(screen.getByText('Tệp')).toBeOnTheScreen();
  });

  it('ComposerAttachExtras: có phạm vi → vẽ khe với bản chụp nháp; ngoài ChatRoom → không vẽ gì', async () => {
    registerComposerAttachRows('t', ({ draft, scope }) => <Text>{`${scope.scopeId}:${draft.content}`}</Text>);
    const draft = toDraftSnapshot({ canSend: true, consume: jest.fn(), readyAssets: [], serialized: { content: 'Xin chào ', mentions: [] }, target: undefined });

    await render(inRoom(<ComposerAttachExtras draft={draft} onDone={jest.fn()} />), { wrapper: Wrapper });
    expect(screen.getByText('ch-1:Xin chào')).toBeOnTheScreen();
  });

  it('ComposerAttachExtras ngoài ChatRoom (vd bản nháp chưa có hội thoại) → không vẽ gì', async () => {
    registerComposerAttachRows('t', () => <Text>không được vẽ</Text>);
    const draft = toDraftSnapshot({ canSend: true, consume: jest.fn(), readyAssets: [], serialized: { content: 'a', mentions: [] }, target: undefined });

    await render(<ComposerAttachExtras draft={draft} onDone={jest.fn()} />, { wrapper: Wrapper });

    expect(screen.queryByText('không được vẽ')).toBeNull();
  });
});

describe('toDraftSnapshot — bản chụp nháp cho "Hẹn giờ gửi"', () => {
  const base = { canSend: true, consume: jest.fn(), readyAssets: [{ assetId: 'a-1' }, { assetId: null }, { assetId: 'a-2' }], serialized: { content: '  Chào @{u:u1}  ', mentions: [{ label: 'An', targetId: 'u1', type: 'USER' as const }, { label: null, targetId: null, type: 'ALL' as const }] } };

  it('đúng những gì handleSend sẽ gửi: nội dung cắt khoảng trắng, nhắc tên dạng DTO (targetId VẮNG MẶT, không label), tệp sẵn sàng, tin đang trả lời', () => {
    const snap = toDraftSnapshot({ ...base, target: { messageId: 'm-9', type: 'reply' } });

    expect(snap).toMatchObject({
      attachmentAssetIds: ['a-1', 'a-2'],
      canSubmit: true,
      content: 'Chào @{u:u1}',
      mentions: [{ targetId: 'u1', type: 'USER' }, { type: 'ALL' }],
      replyToId: 'm-9',
    });
    expect(snap.mentions[1]).not.toHaveProperty('targetId');
  });

  it('đang SỬA tin → canSubmit=false (hẹn giờ một bản sửa vô nghĩa); chưa gửi được (canSend=false) cũng vậy', () => {
    expect(toDraftSnapshot({ ...base, target: { content: 'x', expectedVersion: 1, messageId: 'm-1', type: 'edit' } }).canSubmit).toBe(false);
    expect(toDraftSnapshot({ ...base, canSend: false, target: undefined }).canSubmit).toBe(false);
  });

  it('consume chính là hàm reset của composer (được gọi đúng một lần khi tiện ích gọi)', () => {
    const consume = jest.fn();
    toDraftSnapshot({ ...base, consume, target: undefined }).consume();
    expect(consume).toHaveBeenCalledTimes(1);
  });
});
