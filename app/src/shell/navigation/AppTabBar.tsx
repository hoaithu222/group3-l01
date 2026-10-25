/**
 * ⛔ `@react-navigation/bottom-tabs` KHÔNG phải một gói riêng ở đây.
 *
 * Expo SDK 57 đóng gói React Navigation vào TRONG `expo-router`
 * (`expo-router/build/react-navigation/*`). Thêm `@react-navigation/bottom-tabs`
 * vào `package.json` là kéo về một BẢN SAO THỨ HAI của thư viện: hai
 * `NavigationContainer`, hai bộ context, và triệu chứng là hook điều hướng trả
 * `undefined` ở một màn hình không liên quan.
 *
 * Đường nhập đúng là `expo-router/js-tabs` — cũng chính là chỗ `Tabs` chuyển
 * tới, vì `import { Tabs } from 'expo-router'` đã bị đánh dấu deprecated ở SDK 57.
 */
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { BottomNav, type BottomNavItem } from '@/shared/ui/navigation';
import { hapticSelection } from '@/shared/utils/haptics';
import { useTabBadges } from '@/shell/notifications/useTabBadges';

import { useModulePickerStore } from './module-picker.store';
import { HOME_MODULE, MODULE_REGISTRY } from './module-registry';
import { useMenuModules } from './use-accessible-modules';
import { useReportTabBarHeight } from './use-report-tab-bar-height';

/** Một route trong `state.routes` — tách kiểu ra để `useMemo` không phải phụ thuộc cả `state`. */
type TabRoute = BottomTabBarProps['state']['routes'][number];

/**
 * Thanh tab dưới của app — nối `<Tabs>` của Expo Router vào `BottomNav` của bộ
 * component dùng chung.
 *
 * ── Vì sao KHÔNG dùng thanh tab mặc định của React Navigation ────────────────
 * Thanh mặc định không đi qua NativeWind, nên mọi thứ về hình thức phải khai
 * lại bằng style nội tuyến: màu nền, màu chữ, và cả `fontFamily` (quên dòng đó
 * là nhãn tab lặng lẽ rơi về font hệ thống trong khi cả app dùng font thương
 * hiệu). Tức là hai hệ style song song cho cùng một thứ, và cái ở thanh tab
 * luôn là cái bị quên khi đổi token.
 *
 * `BottomNav` đã dựng theo đúng bản thiết kế, ăn token, tự cộng vùng an toàn
 * đáy và có sẵn huy hiệu số chưa đọc. Nối vào đây thì thanh tab của app và
 * thanh tab trong bộ component là MỘT — sửa một chỗ, đổi cả hai.
 *
 * ── Bố cục: 4 phân hệ chính + Trang chủ ở giữa ──────────────────────────────
 * Các route `placement: 'bar'` còn hiện được chia đôi quanh nút **Trang chủ** (`HOME_MODULE`,
 * route `index`, dùng `featured` của `BottomNav`): 4 mục → 2 | Trang chủ | 2; 3 mục → 1 | Trang chủ | 2;
 * 1 mục → Trang chủ | 1. Phân hệ phụ (`placement: 'menu'`) KHÔNG có tab — giữ nút Trang chủ để mở
 * `ModulePickerSheet`. Thứ tự lấy từ `MODULE_REGISTRY`, không dựa vào thứ tự `state.routes`.
 *
 * ── Chia việc ───────────────────────────────────────────────────────────────
 * `BottomNav` thuần trình bày (nhận `items` + `onSelect`). Phần "bấm thì đi
 * đâu" là việc của navigator, và nó nằm ở đây.
 */
export function AppTabBar({ descriptors, navigation, state }: BottomTabBarProps) {
  /** Số chưa đọc theo tên route (p1-07): tin nhắn · nhóm · hoạt động — `BottomNav` tự ẩn khi `0`/vắng. */
  const badges = useTabBadges();

  /**
   * Chỉ lấy route CÓ hiện tab.
   *
   * `href: null` trong `app/(app)/_layout.tsx` giấu tab của phân hệ không đủ
   * quyền, nhưng route vẫn nằm trong `state.routes` — không lọc thì thanh dưới
   * vẫn vẽ đủ mục và người dùng bấm được vào phân hệ họ không được vào.
   * Dấu hiệu nhận biết: `options.href === null`.
   */
  const visibleRoutes = useMemo(
    () =>
      state.routes.filter((route) => {
        /**
         * ⚠️ `descriptors[key]` khai kiểu là `| undefined` vì
         * `noUncheckedIndexedAccess` đang bật. Không phải lo hão: trong nhịp vẽ
         * đầu sau khi một route bị gỡ, `state.routes` và `descriptors` có thể
         * lệch nhau đúng một nhịp.
         */
        const options = descriptors[route.key]?.options as { href?: string | null } | undefined;
        return options?.href !== null;
      }),
    [descriptors, state.routes],
  );

  /** Có phân hệ phụ thì giữ nút Trang chủ mới có việc để làm — không thì đừng hứa hành động không tồn tại. */
  const openPicker = useModulePickerStore((store) => store.open);
  const hasMenuModules = useMenuModules().length > 0;

  const items = useMemo<BottomNavItem[]>(() => {
    const focusedKey = state.routes[state.index]?.key;

    const toItem = (route: TabRoute): BottomNavItem => {
      const module = MODULE_REGISTRY.find((entry) => entry.name === route.name);
      const focused = focusedKey === route.key;
      return {
        badge: badges[route.name],
        key: route.key,
        label: module?.title ?? descriptors[route.key]?.options.title ?? route.name,
        icon: module ? (
          <Icon
            /**
             * ⛔ Màu icon phải đi CÙNG CẶP với màu nhãn của `BottomNav`.
             *
             * Nền thanh tab là dải gradient đậm (`nav-from` → `nav-to`) ở CẢ HAI
             * chế độ sáng/tối, nên họ `fg-on-nav*` là màu trắng ở cả hai:
             * `fg-on-nav-accent` = trắng 100% (đang mở), `fg-on-nav-muted` = trắng
             * 80% (không). Ghép chéo sang `fg-1` hay `primary-*` là icon mực trên
             * nền đậm — chìm hẳn.
             *
             * ⚠️ Figma `State=Active` dùng icon **solid**, nhưng `assets/icons/system`
             * mới có `linear` + `twotone` nên `activeVariant` mặc định là `twotone`.
             */
            accentColor={focused ? 'fg-on-nav-accent' : 'fg-on-nav-muted'}
            color={focused ? 'fg-on-nav-accent' : 'fg-on-nav-muted'}
            name={module.icon}
            variant={focused ? (module.activeVariant ?? 'twotone') : 'linear'}
          />
        ) : undefined,
      };
    };

    const barRoutes = visibleRoutes
      .filter((route) =>
        MODULE_REGISTRY.some((m) => m.name === route.name && m.placement === 'bar'),
      )
      .sort(
        (a, b) =>
          MODULE_REGISTRY.findIndex((m) => m.name === a.name) -
          MODULE_REGISTRY.findIndex((m) => m.name === b.name),
      );
    const homeRoute = visibleRoutes.find((route) => route.name === HOME_MODULE.name);

    const homeItem: BottomNavItem[] = homeRoute
      ? [
          {
            accessibilityHint: hasMenuModules ? 'Giữ để mở danh sách phân hệ' : undefined,
            featured: true,
            icon: (
              <Icon
                accentColor={focusedKey === homeRoute.key ? 'fg-on-nav-accent' : 'fg-on-nav-muted'}
                color={focusedKey === homeRoute.key ? 'fg-on-nav-accent' : 'fg-on-nav-muted'}
                name={HOME_MODULE.icon}
                variant={focusedKey === homeRoute.key ? 'twotone' : 'linear'}
              />
            ),
            key: homeRoute.key,
            label: HOME_MODULE.title,
            onLongPress: hasMenuModules ? openPicker : undefined,
          },
        ]
      : [];

    // Trang chủ nằm GIỮA: nửa trước = floor(n/2) mục (n = 1 → Trang chủ đứng đầu, n = 4 → 2 | Trang chủ | 2).
    const half = Math.floor(barRoutes.length / 2);
    return [
      ...barRoutes.slice(0, half).map(toItem),
      ...homeItem,
      ...barRoutes.slice(half).map(toItem),
    ];
  }, [badges, descriptors, hasMenuModules, openPicker, state.index, state.routes, visibleRoutes]);

  const activeKey = state.routes[state.index]?.key ?? '';

  /** ⛔ Báo chiều cao THẬT cho `BottomTabView` — thiếu thì ô soạn tin lơ lửng cách bàn phím 5–13dp; lý do đầy đủ ở hook. `View` bọc trần chỉ để có `onLayout`. */
  const onLayout = useReportTabBarHeight();

  return (
    <View testID="app-tab-bar" onLayout={onLayout}>
      <BottomNav
        activeKey={activeKey}
        items={items}
        onSelect={(key) => {
          const route = state.routes.find((entry) => entry.key === key);
          if (!route) return;

          /**
           * ⛔ Phải phát `tabPress` rồi mới điều hướng, và phải tôn trọng
           * `preventDefault()`.
           *
           * Đây là sự kiện mà React Navigation dùng cho hai hành vi người dùng đã
           * quen: bấm lại tab đang mở thì cuộn danh sách lên đầu, và màn hình có
           * việc đang dở (form chưa lưu) chặn được cú chuyển tab. Gọi thẳng
           * `navigate()` là bỏ qua cả hai — không lỗi nào báo, chỉ là app cư xử
           * khác mọi app khác.
           */
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          const focused = state.routes[state.index]?.key === route.key;
          if (focused || event.defaultPrevented) return;
          hapticSelection(); // ⚠️ SAU hai lối thoát trên: chỉ rung khi thật sự đổi sang tab KHÁC (bấm lại · bị chặn · giữ Trang chủ thì im).

          // ⛔ `params: undefined` + `merge` giữ NGUYÊN tham số của tab đích; truyền `route.params` làm tab con mở LẠI màn deep link
          // ⇒ chồng màn trùng, Back đi lòng vòng (số đo: `docs/rules/navigation.md` mục "Nút Back giữa các tab").
          navigation.navigate({ merge: true, name: route.name, params: undefined });
        }}
      />
    </View>
  );
}
