import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
// Tên bắt đầu bằng `Mock` — quy ước của `babel-plugin-jest-hoist` cho biến được phép dùng trong factory `jest.mock`.
import { Pressable as MockPressable, Text as MockText } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { ConversationListItem } from '../api/conversations.types';
import { ConversationSwipeActions } from '../components/ConversationSwipeActions';

/**
 * "Xoá" ở hàng danh sách (nút vuốt và bảng "Tuỳ chọn" khi nhấn giữ) phải đi qua `ClearHistoryConfirmSheet` — cùng câu hỏi
 * với `DirectInfo` — và chỉ bấm "Xoá" trong tấm đó mới `clear()`.
 */
const mockClear = jest.fn();
jest.mock('../hooks/useMyConversationSettings', () => ({
  useMyConversationSettings: () => ({
    archive: jest.fn(),
    clear: mockClear,
    error: null,
    isPending: false,
    markUnread: jest.fn(),
    pin: jest.fn(),
  }),
}));
jest.mock('../components/ConversationNotifySheet', () => ({ ConversationNotifySheet: () => null }));
// Thân hàng thật kéo theo avatar/giờ/định dạng — ở đây chỉ cần cú nhấn giữ.
jest.mock('../components/ConversationRow', () => ({
  ConversationRow: ({ onLongPress }: { onLongPress: () => void }) => (
    <MockPressable accessibilityRole="button" onLongPress={onLongPress}>
      <MockText>Hàng hội thoại</MockText>
    </MockPressable>
  ),
}));

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;
}

const ITEM = {
  archivedAt: null,
  id: 'c-1',
  markedUnread: false,
  muted: false,
  pinnedAt: null,
} as unknown as ConversationListItem;

const CONFIRM_TITLE = 'Xoá cuộc trò chuyện ở phía bạn?';

async function renderRow() {
  await render(<ConversationSwipeActions currentUserId="u-1" item={ITEM} onPress={jest.fn()} />, {
    wrapper: Wrapper,
  });
}

beforeEach(() => jest.clearAllMocks());

describe('ConversationSwipeActions — xoá có xác nhận', () => {
  it('nhấn giữ → "Xoá cuộc trò chuyện" chỉ mở tấm xác nhận; "Huỷ" không xoá', async () => {
    await renderRow();

    await fireEvent(screen.getByRole('button', { name: 'Hàng hội thoại' }), 'longPress');
    await fireEvent.press(await screen.findByText('Xoá cuộc trò chuyện'));

    expect(await screen.findByText(CONFIRM_TITLE)).toBeOnTheScreen();
    expect(mockClear).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Huỷ' }));
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('nút vuốt "Xoá" mở tấm xác nhận; bấm "Xoá" TRONG tấm mới gọi clear() đúng một lần', async () => {
    await renderRow();

    // `Swipeable` thật dựng sẵn dải nút vuốt cạnh hàng (chưa mở tấm thì chỉ có MỘT nút "Xoá" — của dải vuốt).
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá' }));
    expect(await screen.findByText(CONFIRM_TITLE)).toBeOnTheScreen();
    expect(mockClear).not.toHaveBeenCalled();

    // Tấm xác nhận nằm SAU dải vuốt trong cây ⇒ nút "Xoá" cuối cùng là nút của tấm.
    const confirm = screen.getAllByRole('button', { name: 'Xoá' }).at(-1);
    if (!confirm) throw new Error('Thiếu nút "Xoá" của tấm xác nhận');
    await fireEvent.press(confirm);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });
});
