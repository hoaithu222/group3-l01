import { act, fireEvent, render } from '@testing-library/react-native';
import { createRef } from 'react';
import { Text } from 'react-native';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { SwipeableRow, swipeActionsToMenuItems, type SwipeAction } from '@/shared/ui/swipeable-row';

import { accessibleGroupsHidingButtons } from '../helpers/a11y-groups';

/**
 * `SwipeableRow` (p0-12). Jest không mô phỏng được cử chỉ vuốt, nên test kiểm những gì QUYẾT ĐỊNH được: nút hành động tồn tại và
 * gọi đúng `onPress`, nút khuất bị ẨN khỏi trình đọc màn hình cho tới khi lộ ra, đường thay thế bằng menu (`swipeActionsToMenuItems`)
 * khớp hành động. Nút vuốt luôn nằm trong cây (chỉ bị che sau hàng) nên phải `includeHiddenElements` để tìm. `render()` phải `await`.
 */
const pin = jest.fn();
const remove = jest.fn();
const LEFT: SwipeAction[] = [{ icon: 'star', key: 'pin', label: 'Ghim', onPress: pin }];
const RIGHT: SwipeAction[] = [
  { icon: 'delete', key: 'del', label: 'Xoá', onPress: remove, tone: 'danger' },
];

/**
 * RNGH in "[react-native-gesture-handler] Some of the callbacks … are worklets and some are not" mỗi lần dựng `ReanimatedSwipeable` TRONG JEST:
 * Jest nạp bản `lib/commonjs` đã biên dịch (worklet chưa được plugin biến đổi) — chỉ là hiện tượng của môi trường test, trên máy thật Metro nạp
 * `src` và plugin worklets xử lý đúng. Lọc ĐÚNG câu đó, mọi lỗi khác vẫn in ra.
 */
const realConsoleError = console.error;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('[react-native-gesture-handler]')) return;
    realConsoleError(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => jest.clearAllMocks());

describe('SwipeableRow', () => {
  it('vẽ nội dung hàng', async () => {
    const screen = await render(
      <SwipeableRow leftActions={LEFT} rightActions={RIGHT}>
        <Text>Nhóm dự án</Text>
      </SwipeableRow>,
    );

    expect(screen.getByText('Nhóm dự án')).toBeOnTheScreen();
  });

  it('bấm nút hành động ⇒ gọi đúng `onPress` (bên trái và bên phải)', async () => {
    const screen = await render(
      <SwipeableRow leftActions={LEFT} rightActions={RIGHT}>
        <Text>Hàng</Text>
      </SwipeableRow>,
    );

    await fireEvent.press(screen.getByText('Ghim', { includeHiddenElements: true }));
    await fireEvent.press(screen.getByText('Xoá', { includeHiddenElements: true }));

    expect(pin).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('nút CHƯA lộ ra bị ẨN khỏi trình đọc màn hình — không có "nút ma" cho TalkBack', async () => {
    const screen = await render(
      <SwipeableRow leftActions={LEFT} rightActions={RIGHT}>
        <Text>Hàng</Text>
      </SwipeableRow>,
    );

    expect(screen.queryByRole('button', { name: 'Ghim' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull();
    expect(screen.getByRole('button', { hidden: true, name: 'Xoá' })).toBeOnTheScreen();
  });

  it('không có hành động nào ⇒ chỉ vẽ nội dung (không nút)', async () => {
    const screen = await render(
      <SwipeableRow>
        <Text>Hàng trơn</Text>
      </SwipeableRow>,
    );

    expect(screen.getByText('Hàng trơn')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { hidden: true })).toBeNull();
  });

  it('nhãn trợ năng riêng của hành động được dùng cho nút', async () => {
    const screen = await render(
      <SwipeableRow
        leftActions={[
          { accessibilityLabel: 'Ghim cuộc trò chuyện', key: 'p', label: 'Ghim', onPress: pin },
        ]}
      >
        <Text>Hàng</Text>
      </SwipeableRow>,
    );

    expect(
      screen.getByRole('button', { hidden: true, name: 'Ghim cuộc trò chuyện' }),
    ).toBeOnTheScreen();
  });

  it('điều khiển từ ngoài qua `ref` (close/openLeft/openRight/reset) — tay cầm được chuyển ra', async () => {
    const ref = createRef<SwipeableMethods>();
    await render(
      <SwipeableRow ref={ref} leftActions={LEFT}>
        <Text>Hàng</Text>
      </SwipeableRow>,
    );

    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.close).toBe('function');
    expect(typeof ref.current?.openLeft).toBe('function');
    expect(typeof ref.current?.openRight).toBe('function');
    await act(async () => ref.current?.close());
  });

  it('nút hành động KHÔNG nằm trong phần tử `accessible` khác (tới được bằng trình đọc màn hình khi lộ ra)', async () => {
    const screen = await render(
      <SwipeableRow leftActions={LEFT} rightActions={RIGHT}>
        <Text>Hàng</Text>
      </SwipeableRow>,
    );

    expect(accessibleGroupsHidingButtons(screen.toJSON())).toEqual([]);
  });
});

describe('swipeActionsToMenuItems — đường thay thế bắt buộc', () => {
  it('đổi hành động vuốt thành mục menu, giữ khoá/icon/hành vi, tông nguy hiểm → danger', () => {
    const items = swipeActionsToMenuItems([...LEFT, ...RIGHT]);

    expect(items.map((item) => [item.key, item.label, item.icon, item.tone])).toEqual([
      ['pin', 'Ghim', 'star', 'default'],
      ['del', 'Xoá', 'delete', 'danger'],
    ]);
    items[0]?.onPress();
    items[1]?.onPress();
    expect(pin).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('ưu tiên nhãn trợ năng riêng làm nhãn dòng menu', () => {
    const [item] = swipeActionsToMenuItems([
      { accessibilityLabel: 'Ghim cuộc trò chuyện', key: 'p', label: 'Ghim', onPress: pin },
    ]);

    expect(item?.label).toBe('Ghim cuộc trò chuyện');
  });

  it('danh sách rỗng ⇒ mảng rỗng', () => {
    expect(swipeActionsToMenuItems([])).toEqual([]);
  });
});
