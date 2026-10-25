import { render, userEvent } from '@testing-library/react-native';

import { makeMessage } from '../cache/apply-socket-event.fixtures';
import { MessageBubble } from '../components/bubble/MessageBubble';
import { PendingBubble } from '../components/bubble/PendingBubble';
import { TextContent } from '../components/bubble/TextContent';
import { ComposerNotices } from '../components/composer/ComposerNotices';
import type { PendingMessage } from '../store/outbox.store';

const MINH = '507f1f77bcf86cd799439011';

function failed(failCode: string): PendingMessage {
  return {
    clientMessageId: 'c-1',
    scope: { scopeType: 'CHANNEL', scopeId: 'ch-1' },
    status: 'FAILED',
    createdAtLocal: '2026-09-19T00:00:00.000Z',
    autoRetried: true,
    content: `Nhờ @{u:${MINH}} xem`,
    mentions: [{ type: 'USER', targetId: MINH, label: 'Minh' }],
    failCode,
    failMessage: 'Nhắc tên không hợp lệ',
  };
}

describe('PendingBubble — lỗi nhắc tên không gửi lại được', () => {
  it('MSG_008: chỉ còn "Sửa"/"Xoá bản chờ" (gửi y nguyên vẫn hỏng); nội dung hiện tên chứ không phải marker', async () => {
    const screen = await render(
      <PendingBubble
        pending={failed('MSG_008')}
        onDiscard={jest.fn()}
        onEdit={jest.fn()}
        onRetry={jest.fn()}
      />,
    );
    expect(screen.queryByText('Thử lại')).toBeNull();
    expect(screen.getByText('Sửa')).toBeOnTheScreen();
    expect(screen.getByText('Xoá bản chờ')).toBeOnTheScreen();
    expect(screen.getByText('@Minh')).toBeOnTheScreen();
  });

  it('MSG_021 (nhắc @all quá nhiều lần) vẫn cho Thử lại', async () => {
    const onRetry = jest.fn();
    const screen = await render(<PendingBubble pending={failed('MSG_021')} onRetry={onRetry} />);
    await userEvent.press(screen.getByText('Thử lại'));
    expect(onRetry).toHaveBeenCalledWith('c-1');
  });
});

describe('ComposerNotices — chip bị từ chối', () => {
  const base = {
    overLimitLength: undefined,
    retryAfterAt: undefined,
    onRateLimitExpire: jest.fn(),
  };

  it('nói rõ TÊN + phạm vi (kênh/cuộc trò chuyện) và cách sửa', async () => {
    const channel = await render(
      <ComposerNotices {...base} invalidMentionLabel="Minh" scopeType="CHANNEL" />,
    );
    expect(channel.getByText('Minh không còn trong kênh — xoá nhắc tên để gửi')).toBeOnTheScreen();

    const conversation = await render(
      <ComposerNotices {...base} invalidMentionLabel="An" scopeType="CONVERSATION" />,
    );
    expect(
      conversation.getByText('An không còn trong cuộc trò chuyện — xoá nhắc tên để gửi'),
    ).toBeOnTheScreen();
  });

  it('không có chip lỗi thì không có dòng nào', async () => {
    const screen = await render(
      <ComposerNotices {...base} invalidMentionLabel={undefined} scopeType="CHANNEL" />,
    );
    expect(screen.toJSON()).toBeNull();
  });
});

describe('TextContent — chip nhắc tên trong bong bóng', () => {
  it('marker thành "@Tên" trong đoạn chữ; id không bao giờ lộ ra', async () => {
    const screen = await render(
      <TextContent
        content={`Chào @{u:${MINH}}, họp @{all} nhé`}
        mentions={[{ type: 'USER', targetId: MINH, label: 'Minh' }]}
      />,
    );
    expect(screen.getByText('@Minh')).toBeOnTheScreen();
    expect(screen.getByText('@Tất cả')).toBeOnTheScreen();
    expect(screen.queryByText(new RegExp(MINH))).toBeNull();
  });

  it('trong `code` marker giữ nguyên văn (không dựng chip)', async () => {
    const screen = await render(<TextContent content={`\`@{all}\``} />);
    expect(screen.getByText('@{all}')).toBeOnTheScreen();
  });
});

describe('MessageBubble — hàng tóm tắt luồng', () => {
  const root = makeMessage({
    id: 'root-1',
    replyCount: 2,
    lastReplierIds: ['u2'],
    lastReplyAt: '2026-09-19T02:00:00.000Z',
  });
  const item = { kind: 'sent' as const, message: root };

  it('có onOpenThread + replyCount → hàng "2 phản hồi"; chạm mở luồng của ĐÚNG tin gốc', async () => {
    const onOpenThread = jest.fn();
    const screen = await render(
      <MessageBubble grouped={false} isOwn={false} item={item} onOpenThread={onOpenThread} />,
    );
    await userEvent.press(screen.getByText('2 phản hồi'));
    expect(onOpenThread).toHaveBeenCalledWith(root);
  });

  it('không có onOpenThread (hội thoại / trong luồng) → không có hàng tóm tắt dù replyCount > 0', async () => {
    const screen = await render(<MessageBubble grouped={false} isOwn={false} item={item} />);
    expect(screen.queryByText('2 phản hồi')).toBeNull();
  });

  it('tin chưa có replyCount (BE chưa ghép) → không có hàng tóm tắt', async () => {
    const plain = { kind: 'sent' as const, message: makeMessage({ id: 'm-5' }) };
    const screen = await render(
      <MessageBubble grouped={false} isOwn={false} item={plain} onOpenThread={jest.fn()} />,
    );
    expect(screen.queryByText(/phản hồi/)).toBeNull();
  });
});
