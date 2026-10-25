import { render, userEvent, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActionMenuSheet } from '@/shared/ui/action-menu';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { ListItem } from '@/shared/ui/list';

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

/**
 * `getByRole` của RNTL chỉ khớp phần tử `accessible` — `SheetList` là khối bọc (`View` mang `accessibilityRole` nhưng không phải một
 * ô trợ năng để lia tới), nên tìm thẳng trên cây dựng ra. `accessibilityRole` là PROP thường ⇒ Jest đọc được, khác hẳn `className`.
 */
function hasRole(node: unknown, role: string, label?: string): boolean {
  if (!node || typeof node !== 'object') return false;
  const current = node as {
    children?: unknown[] | null;
    props?: { accessibilityLabel?: string; accessibilityRole?: string };
  };
  if (
    current.props?.accessibilityRole === role &&
    (label === undefined || current.props.accessibilityLabel === label)
  ) {
    return true;
  }
  return (current.children ?? []).some((child) => hasRole(child, role, label));
}

/**
 * ⚠️ Chỉ test HÀNH VI. Lề 16dp là `className` (`px-md`) nên Jest không đọc được — `style` luôn rỗng vì NativeWind không biên
 * dịch ở đây (xem `bottom-sheet.test.tsx`). Phần kiểm được: `SheetList` dựng ĐỦ con, chuyển đúng vai/nhãn trợ năng, và hàng
 * `ListItem` bên trong tấm `padded={false}` vẫn bấm được. Lề thật phải nghiệm thu bằng mắt trên máy.
 *
 * `render()` của RNTL 14 là bất đồng bộ — phải `await`.
 */
describe('SheetList', () => {
  it('dựng đủ mọi con của nó (hàng, tiêu đề nhóm, khối tự dựng)', async () => {
    const screen = await render(
      <SheetList>
        <Text>Nhóm A</Text>
        <ListItem label="Hàng 1" />
        <ListItem label="Hàng 2" />
      </SheetList>,
    );

    expect(screen.getByText('Nhóm A')).toBeOnTheScreen();
    expect(screen.getByText('Hàng 1')).toBeOnTheScreen();
    expect(screen.getByText('Hàng 2')).toBeOnTheScreen();
  });

  it('chuyển vai và nhãn trợ năng của cả khối', async () => {
    const screen = await render(
      <SheetList accessibilityLabel="Hạn xác nhận" accessibilityRole="radiogroup">
        <ListItem label="24 giờ" />
      </SheetList>,
    );

    expect(screen.getByLabelText('Hạn xác nhận')).toBeOnTheScreen();
    expect(hasRole(screen.toJSON(), 'radiogroup', 'Hạn xác nhận')).toBe(true);
  });

  it('không tự đặt vai khi nơi gọi không truyền', async () => {
    const screen = await render(
      <SheetList>
        <ListItem label="Hàng 1" />
      </SheetList>,
    );

    expect(hasRole(screen.toJSON(), 'menu')).toBe(false);
    expect(hasRole(screen.toJSON(), 'radiogroup')).toBe(false);
  });

  it('trong tấm `padded={false}`: hàng ListItem vẫn hiện và bấm được, gọi đúng một lần', async () => {
    const onPick = jest.fn();
    const screen = await render(
      <BottomSheet padded={false} title="Thêm mục" visible onClose={jest.fn()}>
        <SheetList accessibilityRole="menu">
          <ListItem label="Trắc nghiệm" onPress={onPick} />
          <ListItem label="Đúng / Sai" onPress={jest.fn()} />
        </SheetList>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(hasRole(screen.toJSON(), 'menu')).toBe(true);
    expect(screen.getByText('Đúng / Sai')).toBeOnTheScreen();

    await userEvent.press(screen.getByText('Trắc nghiệm'));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('`ActionMenuSheet` dùng `SheetList` mà vẫn giữ vai menu và chạy `onPress` của hàng', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ActionMenuSheet
        items={[
          { key: 'a', label: 'Ghim kênh', onPress },
          { key: 'b', label: 'Xoá kênh', onPress: jest.fn(), tone: 'danger' },
        ]}
        title="Kênh Chung"
        visible
        onClose={jest.fn()}
      />,
      { wrapper: Wrapper },
    );

    expect(hasRole(screen.toJSON(), 'menu')).toBe(true);
    await userEvent.press(screen.getByText('Ghim kênh'));
    await waitFor(() => expect(onPress).toHaveBeenCalledTimes(1));
  });
});
