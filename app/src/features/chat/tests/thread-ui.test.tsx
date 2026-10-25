import { type ReactNode } from 'react';
import { render, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { MessageView } from '../api/chat.types';
import { makeMessage } from '../cache/apply-socket-event.fixtures';
import { EmojiPickerSheet } from '../components/actions/EmojiPickerSheet';
import { MessageActionSheet } from '../components/actions/MessageActionSheet';
import { ThreadSummaryRow } from '../components/thread/ThreadSummaryRow';

jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

const noop = jest.fn();
function sheet(message: MessageView, onOpenThread?: (m: MessageView) => void) {
  return (
    <MessageActionSheet
      message={message}
      visible
      onClose={noop}
      onEdit={noop}
      onForward={noop}
      onHide={noop}
      onOpenThread={onOpenThread}
      onPin={noop}
      onRecall={noop}
      onReply={noop}
      onToggleReaction={noop}
      onUnpin={noop}
    />
  );
}

describe('ThreadSummaryRow', () => {
  it('BE chưa ghép tóm tắt (replyCount vắng mặt) hoặc bằng 0 → ẩn cả hàng, không bịa "0 phản hồi"', async () => {
    const absent = await render(<ThreadSummaryRow message={{}} onPress={noop} />);
    expect(absent.toJSON()).toBeNull();
    const zero = await render(<ThreadSummaryRow message={{ replyCount: 0 }} onPress={noop} />);
    expect(zero.toJSON()).toBeNull();
  });

  it('hiện số phản hồi + nhãn trợ năng đọc được tên người trả lời; chạm gọi onPress', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ThreadSummaryRow
        message={{
          replyCount: 4,
          lastReplyAt: '2026-09-19T01:00:00.000Z',
          lastReplierIds: ['u1', 'u2'],
        }}
        resolveAuthor={(id) => (id === 'u1' ? { name: 'An' } : undefined)}
        onPress={onPress}
      />,
    );
    expect(screen.getByText('4 phản hồi')).toBeOnTheScreen();
    const row = screen.getByRole('button');
    expect(row.props.accessibilityLabel).toMatch(/^4 phản hồi, gần nhất từ An/);
    await userEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('nhiều hơn 3 người trả lời chỉ vẽ tối đa 3 avatar', async () => {
    const names: Record<string, string> = { a: 'An', b: 'Bình', c: 'Chi', d: 'Dũng', e: 'Em' };
    const screen = await render(
      <ThreadSummaryRow
        message={{ replyCount: 9, lastReplierIds: ['a', 'b', 'c', 'd', 'e'] }}
        resolveAuthor={(id) => ({ name: names[id] ?? id })}
        onPress={noop}
      />,
    );
    expect(screen.getAllByRole('image')).toHaveLength(3);
    expect(screen.queryByLabelText('Dũng')).toBeNull();
    expect(screen.getByText('9 phản hồi')).toBeOnTheScreen();
  });
});

describe('MessageActionSheet — "Trả lời trong luồng" (p1-06)', () => {
  it('kênh + tin gốc gửi được → có "Trả lời trong luồng"; chạm gọi onOpenThread và KHÔNG gọi API nào (TH-02)', async () => {
    const onOpenThread = jest.fn();
    const message = makeMessage({ id: 'root-1' });
    const screen = await render(sheet(message, onOpenThread), { wrapper: Wrapper });
    await userEvent.press(screen.getByText('Trả lời trong luồng'));
    expect(onOpenThread).toHaveBeenCalledWith(message);
  });

  it('không truyền onOpenThread (hội thoại — BE MSG_018) → mục ẨN, không phải hiện rồi báo lỗi', async () => {
    const screen = await render(sheet(makeMessage({})), { wrapper: Wrapper });
    expect(screen.queryByText('Trả lời trong luồng')).toBeNull();
    expect(screen.queryByText('Xem luồng')).toBeNull();
  });

  it('reply trong luồng (threadId != null, BE MSG_019 cấm luồng lồng) → ẩn', async () => {
    const screen = await render(sheet(makeMessage({ threadId: 'root-1' }), jest.fn()), {
      wrapper: Wrapper,
    });
    expect(screen.queryByText('Trả lời trong luồng')).toBeNull();
  });

  it('tin gốc đã có phản hồi → "Xem luồng"; tin thu hồi mà luồng còn vẫn xem được (MSG-35)', async () => {
    const live = await render(sheet(makeMessage({ replyCount: 3 }), jest.fn()), {
      wrapper: Wrapper,
    });
    expect(live.getByText('Xem luồng')).toBeOnTheScreen();

    const recalled = await render(sheet(makeMessage({ deleted: true, replyCount: 4 }), jest.fn()), {
      wrapper: Wrapper,
    });
    expect(recalled.getByText('Xem luồng')).toBeOnTheScreen();
  });

  it('tin thu hồi chưa có luồng, hoặc người xem không gửi được (ADMINS_ONLY) và chưa có luồng → ẩn', async () => {
    const recalled = await render(sheet(makeMessage({ deleted: true }), jest.fn()), {
      wrapper: Wrapper,
    });
    expect(recalled.queryByText(/luồng/)).toBeNull();

    const readOnly = makeMessage({
      myPermissions: { ...makeMessage({}).myPermissions, canReply: false },
    });
    const noWrite = await render(sheet(readOnly, jest.fn()), { wrapper: Wrapper });
    expect(noWrite.queryByText(/luồng/)).toBeNull();
  });
});

describe('EmojiPickerSheet', () => {
  it('chọn emoji đóng sheet và gọi onSelect với đúng tin + emoji', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const message = makeMessage({ reactions: [{ emoji: '🎉', count: 1, me: true }] });
    const screen = await render(
      <EmojiPickerSheet message={message} visible onClose={onClose} onSelect={onSelect} />,
      {
        wrapper: Wrapper,
      },
    );
    await userEvent.press(screen.getByLabelText('Thả cảm xúc 🔥'));
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(message, '🔥');
  });

  it('emoji CHÍNH MÌNH đã thả được đánh dấu chọn (bấm lại là bỏ)', async () => {
    const message = makeMessage({ reactions: [{ emoji: '🎉', count: 1, me: true }] });
    const screen = await render(
      <EmojiPickerSheet message={message} visible onClose={noop} onSelect={noop} />,
      { wrapper: Wrapper },
    );
    expect(screen.getByLabelText('Thả cảm xúc 🎉')).toBeSelected();
    expect(screen.getByLabelText('Thả cảm xúc 🔥')).not.toBeSelected();
  });
});
