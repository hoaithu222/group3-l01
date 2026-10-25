import { act, fireEvent, render, userEvent } from '@testing-library/react-native';
import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from 'expo-router/js-tabs';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { useModulePickerStore } from '@/shell/navigation/module-picker.store';
import { AppTabBar } from '@/shell/navigation/AppTabBar';
import { HOME_MODULE, MODULE_REGISTRY } from '@/shell/navigation/module-registry';
import type { MenuModuleConfig } from '@/shell/navigation/types';
import { hapticSelection } from '@/shared/utils/haptics';

/**
 * p1-07: `AppTabBar` đọc số huy hiệu từ `useTabBadges()` (query `GET /me/unread/summary`) — test này dựng thanh tab KHÔNG có
 * `QueryClientProvider`, nên thay hook bằng giá trị điều khiển được. Nguồn số + cách ánh xạ registry → huy hiệu có test riêng
 * (`src/shell/notifications/tests/useTabBadges.test.tsx`).
 */
let mockBadges: Record<string, number> = {};
jest.mock('@/shell/notifications/useTabBadges', () => ({ useTabBadges: () => mockBadges }));

/**
 * `useMenuModules()` (danh sách phân hệ phụ) cần `useCapabilities()` + auth store — ngoài phạm vi test bố cục thanh tab.
 * Bản này trả thẳng các mục `menu` của registry (hoặc rỗng, để thử ca "không có phân hệ phụ").
 */
let mockMenuEnabled = true;
jest.mock('@/shell/navigation/use-accessible-modules', () => ({
  useMenuModules: () =>
    mockMenuEnabled
      ? (
          jest.requireActual('@/shell/navigation/module-registry') as {
            MODULE_REGISTRY: MenuModuleConfig[];
          }
        ).MODULE_REGISTRY.filter((module) => module.placement === 'menu')
      : [],
}));

/** Rung là phụ và cần tầng native — thay `hapticSelection` bằng bản đếm được, giữ nguyên phần còn lại của module. */
jest.mock('@/shared/utils/haptics', () => ({
  ...jest.requireActual<Record<string, unknown>>('@/shared/utils/haptics'),
  hapticSelection: jest.fn(),
}));
beforeEach(() => {
  mockBadges = {};
  mockMenuEnabled = true;
  useModulePickerStore.setState({ visible: false });
  jest.mocked(hapticSelection).mockReset();
});

/**
 * ⛔ `BottomNav` gọi `useSafeAreaInsets()`, mà hook đó NÉM LỖI khi không có
 * `SafeAreaProvider` bọc ngoài. `initialMetrics` là bắt buộc: trong Jest không
 * có tầng native nào đo được, thiếu nó thì provider chờ `onLayout` mãi mãi.
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

function renderInSafeArea(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
}

/** Phân hệ CHÍNH theo thứ tự registry: Tin nhắn · Nhóm · Hoạt động · Tôi. */
const BAR_MODULES = MODULE_REGISTRY.filter((module) => module.placement === 'bar');
const MENU_MODULES = MODULE_REGISTRY.filter((module) => module.placement === 'menu');

/**
 * Dựng bộ prop mà React Navigation truyền cho `tabBar`.
 *
 * ⚠️ Ép kiểu MỘT lần ở đây, và chỉ ở đây. `BottomTabBarProps` kéo theo cả cây
 * kiểu của navigator (`TabNavigationState`, `Descriptor`, `NavigationHelpers`);
 * dựng bản đầy đủ chỉ để test là chép lại nội bộ thư viện, mà bản chép đó sẽ
 * mục đi ở lần nâng SDK kế tiếp. Thứ đang test là LOGIC ánh xạ route → mục, và
 * nó chỉ đụng tới bốn trường dưới đây.
 *
 * Route dựng giống `app/(app)/_layout.tsx`: `index` (Trang chủ) đứng ĐẦU, rồi mọi phân hệ có `name`;
 * phân hệ `menu` luôn `href: null` (không có tab), phân hệ `bar` chỉ ẩn khi nằm trong `hiddenRouteNames`.
 */
function makeProps({
  hiddenRouteNames = [],
  index = 0,
  navigate = jest.fn(),
  emit = jest.fn(() => ({ defaultPrevented: false })),
}: {
  emit?: jest.Mock;
  hiddenRouteNames?: string[];
  index?: number;
  navigate?: jest.Mock;
} = {}): BottomTabBarProps {
  const named = MODULE_REGISTRY.filter((module) => module.name);
  const routes = [
    { key: `${HOME_MODULE.name}-key`, name: HOME_MODULE.name, params: undefined },
    ...named.map((module) => ({ key: `${module.name}-key`, name: module.name, params: undefined })),
  ];

  const descriptors = Object.fromEntries(
    routes.map((route) => {
      const module = MODULE_REGISTRY.find((entry) => entry.name === route.name);
      const hidden = module?.placement === 'menu' || hiddenRouteNames.includes(route.name ?? '');
      return [
        route.key,
        { options: { title: module?.title ?? HOME_MODULE.title, href: hidden ? null : undefined } },
      ];
    }),
  );

  return {
    descriptors,
    insets: METRICS.insets,
    navigation: { emit, navigate },
    state: { index, routes },
  } as unknown as BottomTabBarProps;
}

/** `state.index` của route có tên `name` trong bộ prop dựng ở `makeProps`. */
function indexOfRoute(name: string): number {
  const props = makeProps();
  return props.state.routes.findIndex((route) => route.name === name);
}

/** Thứ tự nhãn các tab đang vẽ, từ trái sang phải. */
function tabLabels(screen: Awaited<ReturnType<typeof renderInSafeArea>>): string[] {
  return screen.getAllByRole('tab').map((tab) => {
    const label = tab.props.accessibilityLabel as string;
    return label.split(',')[0] ?? label;
  });
}

describe('AppTabBar', () => {
  it('4 phân hệ chính + Trang chủ ở GIỮA: Tin nhắn · Nhóm · Trang chủ · Hoạt động · Tôi', async () => {
    const screen = await renderInSafeArea(<AppTabBar {...makeProps()} />);

    expect(BAR_MODULES).toHaveLength(4);
    expect(tabLabels(screen)).toEqual(['Tin nhắn', 'Nhóm', 'Trang chủ', 'Hoạt động', 'Tôi']);
  });

  it('phân hệ PHỤ (menu) KHÔNG có tab — chúng nằm trong danh sách chọn phân hệ', async () => {
    const screen = await renderInSafeArea(<AppTabBar {...makeProps()} />);

    expect(MENU_MODULES.length).toBeGreaterThan(0);
    for (const module of MENU_MODULES) {
      expect(screen.queryByText(module.title)).not.toBeOnTheScreen();
    }
    expect(screen.getAllByRole('tab')).toHaveLength(BAR_MODULES.length + 1);
  });

  it('p1-07: số chưa đọc vẽ lên đúng tab và có trong nhãn trợ năng; tab không có số thì không có huy hiệu', async () => {
    const messages = MODULE_REGISTRY.find((m) => m.badge === 'unreadConversations');
    const activity = MODULE_REGISTRY.find((m) => m.badge === 'unread');
    if (!messages || !activity) throw new Error('registry thiếu tab có badge');
    mockBadges = { [messages.name ?? '']: 3, [activity.name ?? '']: 120 };

    const screen = await renderInSafeArea(<AppTabBar {...makeProps()} />);

    expect(
      screen.getByRole('tab', { name: `${messages.title}, 3 mục chưa đọc` }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('tab', { name: `${activity.title}, 120 mục chưa đọc` }),
    ).toBeOnTheScreen();
    expect(screen.getByText('99+', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: HOME_MODULE.title })).toBeOnTheScreen();
  });

  /**
   * ⛔ Ca này chặn một lỗ QUYỀN, không phải lỗi hiển thị.
   *
   * `href: null` là cách `app/(app)/_layout.tsx` giấu tab của phân hệ người dùng
   * không đủ quyền. Route vẫn nằm trong `state.routes`; thanh tab không lọc thì
   * mục đó vẫn hiện ra và bấm được.
   */
  it('KHÔNG vẽ mục của route bị giấu bằng `href: null`', async () => {
    const screen = await renderInSafeArea(
      <AppTabBar {...makeProps({ hiddenRouteNames: ['workspaces'] })} />,
    );

    expect(screen.queryByText('Nhóm')).not.toBeOnTheScreen();
    expect(screen.getAllByRole('tab')).toHaveLength(BAR_MODULES.length);
  });

  it('Trang chủ luôn ở giữa dù chỉ còn 3, hoặc 1, phân hệ chính', async () => {
    const three = await renderInSafeArea(
      <AppTabBar {...makeProps({ hiddenRouteNames: ['messages'] })} />,
    );
    // 3 mục → 1 | Trang chủ | 2
    expect(tabLabels(three)).toEqual(['Nhóm', 'Trang chủ', 'Hoạt động', 'Tôi']);
    await three.unmount();

    // Cờ `communication` tắt: Tin nhắn + Nhóm + Hoạt động cùng ẩn, chỉ còn Tôi → Trang chủ đứng đầu.
    const one = await renderInSafeArea(
      <AppTabBar {...makeProps({ hiddenRouteNames: ['messages', 'workspaces', 'activity'] })} />,
    );
    expect(tabLabels(one)).toEqual(['Trang chủ', 'Tôi']);
  });

  it('thứ tự tab theo registry, không theo thứ tự `state.routes`', async () => {
    const props = makeProps();
    const shuffled = { ...props.state, routes: [...props.state.routes].reverse() };
    const screen = await renderInSafeArea(
      <AppTabBar {...({ ...props, state: shuffled } as unknown as BottomTabBarProps)} />,
    );

    expect(tabLabels(screen)).toEqual(['Tin nhắn', 'Nhóm', 'Trang chủ', 'Hoạt động', 'Tôi']);
  });

  it('Trang chủ đang mở thì được đánh dấu `selected` và chỉ nó', async () => {
    const screen = await renderInSafeArea(
      <AppTabBar {...makeProps({ index: indexOfRoute(HOME_MODULE.name) })} />,
    );

    const selected = screen
      .getAllByRole('tab')
      .filter((tab) => (tab.props.accessibilityState as { selected?: boolean }).selected);
    expect(selected).toHaveLength(1);
    expect(screen.getByRole('tab', { name: HOME_MODULE.title })).toBe(selected[0]);
  });

  it('bấm tab khác thì phát `tabPress` rồi điều hướng tới đúng route', async () => {
    const navigate = jest.fn();
    const emit = jest.fn(() => ({ defaultPrevented: false }));
    const target = BAR_MODULES[2];
    if (!target?.name) throw new Error('registry không có phân hệ chính thứ 3');

    const screen = await renderInSafeArea(<AppTabBar {...makeProps({ emit, navigate })} />);
    await userEvent.press(screen.getByText(target.title));

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: `${target.name}-key` }),
    );
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ name: target.name, merge: true }),
    );
  });

  it('bấm Trang chủ (đang ở tab khác) điều hướng tới route `index`', async () => {
    const navigate = jest.fn();
    const screen = await renderInSafeArea(
      <AppTabBar {...makeProps({ index: indexOfRoute('me'), navigate })} />,
    );
    await userEvent.press(screen.getByText(HOME_MODULE.title));

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ name: HOME_MODULE.name, merge: true }),
    );
    // Bấm thường KHÔNG mở danh sách phân hệ — đó là việc của cú giữ.
    expect(useModulePickerStore.getState().visible).toBe(false);
  });

  it('GIỮ nút Trang chủ mở danh sách chọn phân hệ, và nút có gợi ý trợ năng', async () => {
    const screen = await renderInSafeArea(<AppTabBar {...makeProps()} />);
    const home = screen.getByRole('tab', { name: HOME_MODULE.title });

    expect(home.props.accessibilityHint).toBe('Giữ để mở danh sách phân hệ');
    await act(async () => {
      fireEvent(home, 'longPress');
    });

    expect(useModulePickerStore.getState().visible).toBe(true);
  });

  it('không còn phân hệ phụ nào thì giữ Trang chủ không làm gì và không hứa hẹn gì', async () => {
    mockMenuEnabled = false;
    const screen = await renderInSafeArea(<AppTabBar {...makeProps()} />);
    const home = screen.getByRole('tab', { name: HOME_MODULE.title });

    expect(home.props.accessibilityHint).toBeUndefined();
    await act(async () => {
      fireEvent(home, 'longPress');
    });
    expect(useModulePickerStore.getState().visible).toBe(false);
  });

  /**
   * Bấm lại tab ĐANG mở không được điều hướng: đó là cú "cuộn lên đầu" mà màn
   * hình tự xử qua sự kiện `tabPress`. Điều hướng thêm một lần nữa sẽ dựng lại
   * màn và người dùng mất vị trí cuộn.
   */
  it('bấm lại tab đang mở thì KHÔNG điều hướng', async () => {
    const navigate = jest.fn();
    const current = BAR_MODULES[0];
    if (!current?.name) throw new Error('registry không có phân hệ chính');

    const screen = await renderInSafeArea(
      <AppTabBar {...makeProps({ index: indexOfRoute(current.name), navigate })} />,
    );
    await userEvent.press(screen.getByText(current.title));

    expect(navigate).not.toHaveBeenCalled();
  });

  /**
   * ⛔ `preventDefault()` phải được tôn trọng: đó là cách một màn hình có việc
   * đang dở (form chưa lưu) chặn cú chuyển tab. Bỏ qua nó thì người dùng mất
   * dữ liệu đang nhập mà không có cảnh báo nào.
   */
  it('tôn trọng `preventDefault()` của người nghe `tabPress`', async () => {
    const navigate = jest.fn();
    const emit = jest.fn(() => ({ defaultPrevented: true }));
    const target = BAR_MODULES[1];
    if (!target) throw new Error('registry không có phân hệ chính thứ 2');

    const screen = await renderInSafeArea(<AppTabBar {...makeProps({ emit, navigate })} />);
    await userEvent.press(screen.getByText(target.title));

    expect(emit).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  /**
   * Rung "chọn" là tín hiệu ĐÃ ĐỔI tab: phải đi SAU `tabPress` (người nghe còn chặn được) và TRƯỚC `navigate`.
   * Rung cả khi bấm lại / bị chặn / giữ Trang chủ thì rung mất nghĩa — người dùng cảm thấy "đã chuyển" dù chưa chuyển.
   */
  it('đổi sang tab KHÁC thì rung đúng một lần, theo thứ tự tabPress → rung → navigate', async () => {
    const order: string[] = [];
    const emit = jest.fn(() => {
      order.push('tabPress');
      return { defaultPrevented: false };
    });
    const navigate = jest.fn(() => order.push('navigate'));
    jest.mocked(hapticSelection).mockImplementation(() => {
      order.push('haptic');
    });
    const target = BAR_MODULES[1];
    if (!target) throw new Error('registry không có phân hệ chính thứ 2');

    const screen = await renderInSafeArea(<AppTabBar {...makeProps({ emit, navigate })} />);
    await userEvent.press(screen.getByText(target.title));

    expect(hapticSelection).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['tabPress', 'haptic', 'navigate']);
  });

  it('KHÔNG rung khi bấm lại tab đang mở, khi `tabPress` bị chặn, hay khi GIỮ Trang chủ', async () => {
    const current = BAR_MODULES[0];
    const other = BAR_MODULES[1];
    if (!current?.name || !other) throw new Error('registry thiếu phân hệ chính');

    const again = await renderInSafeArea(
      <AppTabBar {...makeProps({ index: indexOfRoute(current.name) })} />,
    );
    await userEvent.press(again.getByText(current.title));
    await again.unmount();

    const blocked = await renderInSafeArea(
      <AppTabBar {...makeProps({ emit: jest.fn(() => ({ defaultPrevented: true })) })} />,
    );
    await userEvent.press(blocked.getByText(other.title));
    await blocked.unmount();

    const hold = await renderInSafeArea(
      <AppTabBar {...makeProps({ index: indexOfRoute(current.name) })} />,
    );
    await act(async () => {
      fireEvent(hold.getByRole('tab', { name: HOME_MODULE.title }), 'longPress');
    });

    expect(useModulePickerStore.getState().visible).toBe(true);
    expect(hapticSelection).not.toHaveBeenCalled();
  });

  /**
   * ⛔ Chốt lỗi "ô soạn tin lơ lửng cách bàn phím ~10dp": `BottomNav` không tự báo chiều cao, nên `BottomTabBarHeightContext`
   * mãi là số ước lượng `49 + insets.bottom` (thấp hơn thanh thật ≥ 5dp) và `ComposerBody` bù hụt đúng bấy nhiêu. Thanh tab
   * PHẢI báo số đo thật qua `BottomTabBarHeightCallbackContext` mỗi lần bố cục đổi.
   */
  it('báo chiều cao THẬT của thanh tab cho navigator mỗi lần đo lại bố cục', async () => {
    const report = jest.fn();
    const screen = await renderInSafeArea(
      <BottomTabBarHeightCallbackContext.Provider value={report}>
        <AppTabBar {...makeProps()} />
      </BottomTabBarHeightCallbackContext.Provider>,
    );

    const bar = screen.getByTestId('app-tab-bar');
    // ⚠️ `await act` — `fireEvent` của RNTL 14 bất đồng bộ; không đợi thì act rò sang test kế và `render` của nó ra cây rỗng.
    await act(async () => {
      fireEvent(bar, 'layout', { nativeEvent: { layout: { height: 88 } } });
    });
    expect(report).toHaveBeenLastCalledWith(88);

    // Chữ nhãn phóng to (Cỡ chữ: Lớn) làm thanh cao hơn ⇒ phải báo lại số mới, không giữ số cũ.
    await act(async () => {
      fireEvent(bar, 'layout', { nativeEvent: { layout: { height: 96 } } });
    });
    expect(report).toHaveBeenLastCalledWith(96);
  });

  it('dựng ngoài `BottomTabView` (không có callback) thì onLayout không lỗi', async () => {
    const screen = await renderInSafeArea(<AppTabBar {...makeProps()} />);
    const bar = screen.getByTestId('app-tab-bar');

    await act(async () => {
      fireEvent(bar, 'layout', { nativeEvent: { layout: { height: 88 } } });
    });
    expect(bar).toBeOnTheScreen();
  });
});
