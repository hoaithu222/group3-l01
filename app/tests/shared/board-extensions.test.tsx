import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  BoardCardActionsSlot,
  BoardHeaderActionsSlot,
  registerBoardCardAction,
  registerBoardHeaderAction,
  resetBoardExtensions,
} from '@/shared/board-extensions';

/**
 * Khe nối lối vào của feature khác vào màn bảng (p4-06): `features/boards` không import feature khác nên feature nguồn đăng ký renderer ở nơi lắp ráp, màn bảng chỉ vẽ
 * `<BoardHeaderActionsSlot />` / `<BoardCardActionsSlot />`. Cùng mẫu `@/shared/profile` và `@/shared/calls`.
 */
const CONTEXT = { boardId: 'b1', wsId: 'w1' };

afterEach(() => resetBoardExtensions());

describe('BoardHeaderActionsSlot', () => {
  it('chưa đăng ký (test, cờ tắt) ⇒ không vẽ gì, thanh tiêu đề giữ nguyên hình dạng', async () => {
    await render(<>{BoardHeaderActionsSlot(CONTEXT)}</>);

    expect(screen.toJSON()).toBeNull();
  });

  it('đăng ký renderer ⇒ vẽ đúng nội dung, renderer nhận wsId/boardId của màn', async () => {
    registerBoardHeaderAction('contribution', (context) => <Text>{`Đóng góp ${context.wsId}/${context.boardId}`}</Text>);
    await render(<>{BoardHeaderActionsSlot(CONTEXT)}</>);

    expect(screen.getByText('Đóng góp w1/b1')).toBeOnTheScreen();
  });

  it('nhiều feature cùng đăng ký ⇒ vẽ đủ theo thứ tự đăng ký; đăng ký lại cùng id chỉ GHI ĐÈ (an toàn với Fast Refresh)', async () => {
    registerBoardHeaderAction('a', () => <Text>Nút A</Text>);
    registerBoardHeaderAction('b', () => <Text>Nút B</Text>);
    registerBoardHeaderAction('a', () => <Text>Nút A mới</Text>);
    await render(<>{BoardHeaderActionsSlot(CONTEXT)}</>);

    expect(screen.getByText('Nút A mới')).toBeOnTheScreen();
    expect(screen.getByText('Nút B')).toBeOnTheScreen();
    expect(screen.queryByText('Nút A')).toBeNull();
  });

  it('gỡ đăng ký (null) ⇒ quay về không vẽ gì; renderer trả null (cờ tắt) ⇒ không vẽ gì', async () => {
    registerBoardHeaderAction('a', () => <Text>Có</Text>);
    registerBoardHeaderAction('a', null);
    registerBoardHeaderAction('b', () => null);
    await render(<>{BoardHeaderActionsSlot(CONTEXT)}</>);

    expect(screen.queryByText('Có')).toBeNull();
  });
});

describe('BoardCardActionsSlot', () => {
  it('độc lập với khe tiêu đề: đăng ký một khe không làm hiện khe kia', async () => {
    registerBoardHeaderAction('contribution', () => <Text>Ở tiêu đề</Text>);
    registerBoardCardAction('contribution', (context) => <Text>{`Ở thẻ ${context.boardId}`}</Text>);
    await render(<>{BoardCardActionsSlot({ boardId: 'b9', wsId: 'w1' })}</>);

    expect(screen.getByText('Ở thẻ b9')).toBeOnTheScreen();
    expect(screen.queryByText('Ở tiêu đề')).toBeNull();
  });
});
