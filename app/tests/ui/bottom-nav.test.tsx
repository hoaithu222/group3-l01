import { render, userEvent } from '@testing-library/react-native';
import { type ReactElement } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { BottomActionBar, BottomNav, type BottomNavItem } from '@/shared/ui/navigation';

/**
 * ⚠️ Chỉ test HÀNH VI. `className` KHÔNG thành `style` trong Jest — xem
 * `docs/rules/testing.md`. ⛔ Đệm đáy theo vùng an toàn (`insets.bottom`) là
 * thứ quan trọng nhất của cả hai component này, nhưng nó là một con số trong
 * `style` nội tuyến nên kiểm ở đây chỉ là chép lại hằng số; nó phải nghiệm thu
 * trên máy có vạch gạt ngang.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 *
 * ⛔ Cả hai component gọi `useSafeAreaInsets()`, mà hook đó NÉM LỖI khi không
 * có `SafeAreaProvider` bọc ngoài. `initialMetrics` là bắt buộc: trong Jest
 * không có tầng native nào đo được, thiếu nó thì provider chờ `onLayout` mãi
 * mãi. Số đo iPhone X — đúng ca mà đệm đáy phải cộng thêm.
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

function renderInSafeArea(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
}

/** RNTL 14 đã bỏ `UNSAFE_getAllByProps`, nên tự duyệt cây JSON đã render. */
type JsonNode = { children?: unknown[] | null; props?: Record<string, unknown> } | null;

function findByProp(node: unknown, key: string, value: unknown): JsonNode {
  if (!node || typeof node !== 'object') return null;
  const current = node as { children?: unknown[] | null; props?: Record<string, unknown> };
  if (current.props?.[key] === value) return current;
  for (const child of current.children ?? []) {
    const found = findByProp(child, key, value);
    if (found) return found;
  }
  return null;
}

const ITEMS: BottomNavItem[] = [
  { icon: <Text>🏠</Text>, key: 'home', label: 'Trang chủ' },
  { badge: 3, icon: <Text>🔔</Text>, key: 'alerts', label: 'Thông báo' },
  { icon: <Text>👤</Text>, key: 'profile', label: 'Cá nhân' },
];

describe('BottomNav', () => {
  it('vẽ đủ nhãn của mọi mục', async () => {
    const screen = await renderInSafeArea(
      <BottomNav activeKey="home" items={ITEMS} onSelect={jest.fn()} />,
    );

    expect(screen.getByText('Trang chủ')).toBeOnTheScreen();
    expect(screen.getByText('Thông báo')).toBeOnTheScreen();
    expect(screen.getByText('Cá nhân')).toBeOnTheScreen();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
  });

  it('danh sách rỗng vẫn dựng được, không nổ', async () => {
    const screen = await renderInSafeArea(
      <BottomNav activeKey="home" items={[]} onSelect={jest.fn()} />,
    );

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('bấm một mục thì báo về đúng KHOÁ của nó, đúng một lần', async () => {
    const onSelect = jest.fn();
    const screen = await renderInSafeArea(
      <BottomNav activeKey="home" items={ITEMS} onSelect={onSelect} />,
    );

    await userEvent.press(screen.getByRole('tab', { name: 'Cá nhân' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('profile');
  });

  /** Bấm lại mục đang mở vẫn báo về — nơi gọi tự lọc nếu muốn (cuộn lên đầu…). */
  it('bấm lại mục đang mở vẫn báo về', async () => {
    const onSelect = jest.fn();
    const screen = await renderInSafeArea(
      <BottomNav activeKey="home" items={ITEMS} onSelect={onSelect} />,
    );

    await userEvent.press(screen.getByRole('tab', { name: 'Trang chủ' }));

    expect(onSelect).toHaveBeenCalledWith('home');
  });

  /**
   * ⛔ Đúng MỘT mục ở trạng thái đang chọn, và tín hiệu đó phải nằm ở
   * `accessibilityState.selected` chứ không chỉ ở màu nền — trình đọc màn hình
   * không thấy màu, mà thanh dưới là chỗ người dùng dễ lạc nhất khi không biết
   * mình đang ở phân hệ nào.
   */
  it('chỉ một mục ở trạng thái đang chọn', async () => {
    const screen = await renderInSafeArea(
      <BottomNav activeKey="alerts" items={ITEMS} onSelect={jest.fn()} />,
    );

    const tabs = screen.getAllByRole('tab');

    expect(tabs.filter((tab) => tab.props.accessibilityState?.selected)).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Thông báo, 3 mục chưa đọc' })).toBeSelected();
  });

  /**
   * ⛔ Đây là lý do huy hiệu phải được GỘP vào nhãn.
   *
   * Con số trong ô đỏ là hình ảnh — trình đọc màn hình không đọc nó, và ô đó
   * còn bị chủ động giấu đi để khỏi bị đọc tách rời thành "3". Không gộp thì
   * người dùng khiếm thị hoàn toàn không biết có thông báo chưa đọc.
   */
  it('gộp số chưa đọc vào nhãn trợ năng của mục', async () => {
    const screen = await renderInSafeArea(
      <BottomNav activeKey="home" items={ITEMS} onSelect={jest.fn()} />,
    );

    expect(screen.getByLabelText('Thông báo, 3 mục chưa đọc')).toBeOnTheScreen();
  });

  /**
   * ⚠️ RNTL mặc định BỎ QUA phần tử bị giấu khỏi trợ năng — nên "không thấy
   * theo cách thường, thấy khi bật `includeHiddenElements`" chính là bằng chứng
   * ô huy hiệu đã bị giấu đúng.
   */
  it('ô huy hiệu vẫn vẽ ra nhưng bị giấu khỏi trình đọc màn hình', async () => {
    const screen = await renderInSafeArea(
      <BottomNav activeKey="home" items={ITEMS} onSelect={jest.fn()} />,
    );

    expect(screen.queryByText('3')).toBeNull();
    expect(screen.getByText('3', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('không có huy hiệu thì nhãn chỉ còn tên mục', async () => {
    const screen = await renderInSafeArea(
      <BottomNav activeKey="home" items={ITEMS} onSelect={jest.fn()} />,
    );

    expect(screen.getByRole('tab', { name: 'Trang chủ' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Trang chủ, 0 mục chưa đọc')).toBeNull();
  });

  /** `badge: 0` = "không có gì chưa đọc" ⇒ KHÔNG vẽ ô đỏ, và nhãn cũng không nhắc tới. */
  it('huy hiệu bằng 0 thì không vẽ ô và không vào nhãn', async () => {
    const screen = await renderInSafeArea(
      <BottomNav
        activeKey="home"
        items={[{ badge: 0, key: 'alerts', label: 'Thông báo' }]}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.queryByText('0', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Thông báo' })).toBeOnTheScreen();
  });

  /**
   * ⛔ Ô đỏ cắt ở "99+" vì không đủ chỗ, nhưng nhãn trợ năng phải đọc SỐ THẬT.
   * Cắt cả ở nhãn thì người dùng khiếm thị mất hẳn thông tin, còn người sáng
   * mắt vẫn mở ra là thấy đủ — đúng kiểu bất công im lặng.
   */
  it('trên 99 thì ô đỏ cắt thành "99+" nhưng nhãn vẫn đọc số thật', async () => {
    const screen = await renderInSafeArea(
      <BottomNav
        activeKey="home"
        items={[{ badge: 128, key: 'alerts', label: 'Thông báo' }]}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.getByText('99+', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.queryByText('128', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText('Thông báo, 128 mục chưa đọc')).toBeOnTheScreen();
  });

  it('mục đang mở dùng activeIcon, mục còn lại dùng icon thường', async () => {
    const items: BottomNavItem[] = [
      {
        activeIcon: <Text>Nhà đậm</Text>,
        icon: <Text>Nhà nhạt</Text>,
        key: 'home',
        label: 'Trang chủ',
      },
      {
        activeIcon: <Text>Chuông đậm</Text>,
        icon: <Text>Chuông nhạt</Text>,
        key: 'alerts',
        label: 'Thông báo',
      },
    ];

    const screen = await renderInSafeArea(
      <BottomNav activeKey="home" items={items} onSelect={jest.fn()} />,
    );

    expect(screen.getByText('Nhà đậm')).toBeOnTheScreen();
    expect(screen.queryByText('Nhà nhạt')).toBeNull();
    expect(screen.getByText('Chuông nhạt')).toBeOnTheScreen();
    expect(screen.queryByText('Chuông đậm')).toBeNull();
  });

  /** Không có `activeIcon` thì mục đang mở rơi về `icon` thường, không mất biểu tượng. */
  it('thiếu activeIcon thì mục đang mở vẫn giữ icon thường', async () => {
    const screen = await renderInSafeArea(
      <BottomNav
        activeKey="home"
        items={[{ icon: <Text>Nhà</Text>, key: 'home', label: 'Trang chủ' }]}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.getByText('Nhà')).toBeOnTheScreen();
  });

  /**
   * ⛔ Thanh tab của bản vẽ (`259:95676`, `Type=Menu`) có nền GRADIENT XANH ĐẬM
   * chứ không phải nền trắng — nền trắng là của component "bottom bar" nằm cùng
   * section. Màu thì không kiểm được trong Jest (`className` không thành `style`),
   * nhưng cái LỚP vẽ dải màu thì kiểm được: nó phải tồn tại, không ăn cú chạm
   * (nếu không thì phủ kín thanh và bấm tab không ăn), và im lặng với trình đọc
   * màn hình.
   */
  it('có lớp nền dải màu, không ăn cú chạm và im lặng với trình đọc màn hình', async () => {
    const screen = await renderInSafeArea(
      <BottomNav activeKey="home" items={ITEMS} onSelect={jest.fn()} />,
    );

    const decoration = findByProp(screen.toJSON(), 'pointerEvents', 'none');

    expect(decoration).not.toBeNull();
    expect(decoration?.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });

  /**
   * Mục GIỮA nổi bật (Trang chủ). Kiểu dáng (`featured`) là class nên không kiểm được ở Jest — ở đây chỉ khoá
   * HÀNH VI của hai prop đi kèm: cú giữ gọi `onLongPress` mà KHÔNG nuốt cú chạm thường, và gợi ý trợ năng đi tới tab.
   */
  it('giữ mục gọi `onLongPress`, chạm thường vẫn gọi `onSelect`; gợi ý trợ năng đi kèm', async () => {
    const onSelect = jest.fn();
    const onLongPress = jest.fn();
    const screen = await renderInSafeArea(
      <BottomNav
        activeKey="alerts"
        items={[
          { icon: <Text>🔔</Text>, key: 'alerts', label: 'Thông báo' },
          {
            accessibilityHint: 'Giữ để mở danh sách phân hệ',
            featured: true,
            icon: <Text>🏠</Text>,
            key: 'home',
            label: 'Trang chủ',
            onLongPress,
          },
        ]}
        onSelect={onSelect}
      />,
    );

    const home = screen.getByRole('tab', { name: 'Trang chủ' });
    expect(home.props.accessibilityHint).toBe('Giữ để mở danh sách phân hệ');
    expect(screen.getByRole('tab', { name: 'Thông báo' }).props.accessibilityHint).toBeUndefined();

    await userEvent.longPress(home);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    await userEvent.press(home);
    expect(onSelect).toHaveBeenCalledWith('home');
  });

  /** Nhãn tab là một dòng và cắt ở đuôi — thanh chia đều 5 cột, không có chỗ xuống dòng. */
  it('khoá nhãn ở một dòng và cắt ở đuôi', async () => {
    const screen = await renderInSafeArea(
      <BottomNav
        activeKey="home"
        items={[{ key: 'save', label: 'Tiết kiệm trực tuyến' }]}
        onSelect={jest.fn()}
      />,
    );

    const label = screen.getByText('Tiết kiệm trực tuyến');

    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.ellipsizeMode).toBe('tail');
  });
});

describe('BottomActionBar', () => {
  it('vẽ nội dung được truyền vào', async () => {
    const screen = await renderInSafeArea(
      <BottomActionBar>
        <Text>Xác nhận</Text>
      </BottomActionBar>,
    );

    expect(screen.getByText('Xác nhận')).toBeOnTheScreen();
  });

  it('vẽ được nhiều nút và bấm được từng nút', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const screen = await renderInSafeArea(
      <BottomActionBar divider>
        <Text accessibilityRole="button" onPress={onCancel}>
          Huỷ
        </Text>
        <Text accessibilityRole="button" onPress={onConfirm}>
          Xác nhận
        </Text>
      </BottomActionBar>,
    );

    await userEvent.press(screen.getByRole('button', { name: 'Xác nhận' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  /**
   * ⛔ Vùng nút của một màn hình KHÔNG phải thanh tab. Gắn `tablist`/`tab` vào
   * đây thì trình đọc màn hình đọc nút "Xác nhận" thành một tab, và người dùng
   * chờ nó chuyển màn thay vì hiểu là mình vừa gửi giao dịch. Đó chính là lý do
   * component này tách khỏi `BottomNav`.
   */
  it('KHÔNG tự gắn vai điều hướng cho nội dung', async () => {
    const screen = await renderInSafeArea(
      <BottomActionBar>
        <Text>Xác nhận</Text>
      </BottomActionBar>,
    );

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});
