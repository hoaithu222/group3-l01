import { render, userEvent, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActionMenu, ActionMenuSheet } from '@/shared/ui/action-menu';

/** Cùng lý do với `bottom-sheet.test.tsx`: thư viện bàn phím gọi native lúc nạp module, và `useSafeAreaInsets` cần provider. */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

/** Chỉ test HÀNH VI (Jest không có style). `render()` của RNTL 14 là bất đồng bộ — phải `await`. */
describe('ActionMenu', () => {
  it('chỉ vẽ nút "⋯" khi chưa mở; các hàng chưa xuất hiện', async () => {
    const screen = await render(
      <ActionMenu items={[{ key: 'a', label: 'Tin đã ghim', onPress: jest.fn() }]} />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole('button', { name: 'Thêm tuỳ chọn' })).toBeOnTheScreen();
    expect(screen.queryByText('Tin đã ghim')).toBeNull();
  });

  it('bấm nút mở tấm và liệt kê các hàng, bỏ qua hàng `hidden`', async () => {
    const screen = await render(
      <ActionMenu
        items={[
          { key: 'a', label: 'Tin đã ghim', onPress: jest.fn() },
          { key: 'b', label: 'Xoá kênh', hidden: true, onPress: jest.fn(), tone: 'danger' },
          { key: 'c', label: 'Thành viên', onPress: jest.fn() },
        ]}
        title="Kênh Chung"
      />,
      { wrapper: Wrapper },
    );

    await userEvent.press(screen.getByRole('button', { name: 'Thêm tuỳ chọn' }));

    expect(await screen.findByText('Tin đã ghim')).toBeOnTheScreen();
    expect(screen.getByText('Thành viên')).toBeOnTheScreen();
    expect(screen.queryByText('Xoá kênh')).toBeNull();
  });

  it('bấm một hàng thì gọi đúng `onPress` của hàng đó (sau khi đóng tấm), đúng một lần', async () => {
    const pins = jest.fn();
    const members = jest.fn();
    const screen = await render(
      <ActionMenu
        items={[
          { key: 'a', label: 'Tin đã ghim', onPress: pins },
          { key: 'c', label: 'Thành viên', onPress: members },
        ]}
      />,
      { wrapper: Wrapper },
    );

    await userEvent.press(screen.getByRole('button', { name: 'Thêm tuỳ chọn' }));
    await userEvent.press(await screen.findByText('Thành viên'));

    await waitFor(() => expect(members).toHaveBeenCalledTimes(1));
    expect(pins).not.toHaveBeenCalled();
  });

  it('không còn hàng nào hiện ⇒ không vẽ cả nút (tránh nút "⋯" mở ra tấm rỗng)', async () => {
    const screen = await render(
      <ActionMenu items={[{ key: 'a', label: 'Xoá', hidden: true, onPress: jest.fn() }]} />,
      { wrapper: Wrapper },
    );

    expect(screen.queryByRole('button', { name: 'Thêm tuỳ chọn' })).toBeNull();
  });

  it('nhãn trợ năng của nút đổi được (nhiều menu trên một màn phải phân biệt được)', async () => {
    const screen = await render(
      <ActionMenu
        accessibilityLabel="Tuỳ chọn kênh"
        items={[{ key: 'a', label: 'Tin đã ghim', onPress: jest.fn() }]}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole('button', { name: 'Tuỳ chọn kênh' })).toBeOnTheScreen();
  });
});

/** Bản do NƠI GỌI điều khiển mở/đóng (menu mở từ nút "⋯" của từng thẻ, không phải từ nút của chính nó). */
describe('ActionMenuSheet', () => {
  it('đóng (`visible=false`) thì không liệt kê hàng nào; mở thì liệt kê, bỏ qua hàng `hidden`', async () => {
    const items = [
      { key: 'a', label: 'Sao chép link', onPress: jest.fn() },
      { key: 'b', label: 'Xoá thẻ', hidden: true, onPress: jest.fn(), tone: 'danger' as const },
    ];
    const screen = await render(
      <ActionMenuSheet items={items} visible={false} onClose={jest.fn()} />,
      {
        wrapper: Wrapper,
      },
    );
    expect(screen.queryByText('Sao chép link')).toBeNull();

    await screen.rerender(
      <ActionMenuSheet items={items} title="Tuỳ chọn thẻ" visible onClose={jest.fn()} />,
    );
    expect(await screen.findByText('Sao chép link')).toBeOnTheScreen();
    expect(screen.queryByText('Xoá thẻ')).toBeNull();
  });

  it('bấm hàng: gọi `onClose` NGAY, `onPress` của hàng chạy đúng một lần sau đó; hàng `disabled` không chạy', async () => {
    const onClose = jest.fn();
    const copy = jest.fn();
    const locked = jest.fn();
    const screen = await render(
      <ActionMenuSheet
        items={[
          { key: 'a', label: 'Sao chép link', onPress: copy },
          { key: 'b', label: 'Giao cho tôi', disabled: true, onPress: locked },
        ]}
        visible
        onClose={onClose}
      />,
      { wrapper: Wrapper },
    );

    await userEvent.press(await screen.findByText('Giao cho tôi'));
    expect(locked).not.toHaveBeenCalled();

    await userEvent.press(screen.getByText('Sao chép link'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(copy).toHaveBeenCalledTimes(1));
  });
});

/** p0-12 — `ActionMenuSheet` là "ActionSheet" của kế hoạch: nhóm nguy hiểm tách ở CUỐI, vùng chứa là `menu`. */
describe('ActionMenuSheet — nhóm nguy hiểm và vai trò menu', () => {
  it('mục `danger` LUÔN xuống cuối tấm dù khai ở giữa; thứ tự trong từng nhóm giữ nguyên', async () => {
    const screen = await render(
      <ActionMenuSheet
        items={[
          { key: 'a', label: 'Sao chép link', onPress: jest.fn() },
          { key: 'x', label: 'Xoá thẻ', onPress: jest.fn(), tone: 'danger' },
          { key: 'b', label: 'Giao cho tôi', onPress: jest.fn() },
          { key: 'y', label: 'Rời kênh', onPress: jest.fn(), tone: 'danger' },
        ]}
        visible
        onClose={jest.fn()}
      />,
      { wrapper: Wrapper },
    );

    await screen.findByText('Sao chép link');
    const order = ['Sao chép link', 'Giao cho tôi', 'Xoá thẻ', 'Rời kênh'].map((label) =>
      JSON.stringify(screen.toJSON()).indexOf(label),
    );

    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((first, second) => first - second)).toEqual(order);
  });

  it('vùng chứa các hàng có vai trò `menu` cho trình đọc màn hình', async () => {
    const screen = await render(
      <ActionMenuSheet
        items={[{ key: 'a', label: 'Sao chép link', onPress: jest.fn() }]}
        visible
        onClose={jest.fn()}
      />,
      { wrapper: Wrapper },
    );

    await screen.findByText('Sao chép link');

    // `menu` là vai trò của KHỐI CHỨA (không `accessible` — nếu không, các hàng con gộp thành một ô và không lia tới được),
    // nên `getByRole` không thấy; đi bộ trên cây để kiểm.
    const roles: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const item = node as { children?: unknown[]; props?: { accessibilityRole?: string } };
      if (item.props?.accessibilityRole) roles.push(item.props.accessibilityRole);
      (item.children ?? []).forEach(walk);
    };
    walk(screen.toJSON());

    expect(roles).toContain('menu');
  });
});
