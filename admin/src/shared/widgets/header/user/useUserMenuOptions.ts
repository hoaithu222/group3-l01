/**
 * useUserMenuOptions — gom danh sách mục + handler của `<UserMenu>`.
 *
 * Tách khỏi `UserMenu.tsx` để file component ở dưới ngưỡng 200 dòng
 * (`clean-code-standards.md §3`) và để phần "state của các công tắc" (theme,
 * Dock, kiểu header) nằm MỘT chỗ thay vì rải trong JSX.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * KEY ĐỘNG KHÔNG BAO GIỜ ĐI RA `onSelect`
 * ─────────────────────────────────────────────────────────────────────────
 * `AppHeader.tsx` nhận `onSelect` và điều hướng: `logout` → đăng xuất,
 * `profile` → hồ sơ, CÒN LẠI → trang Cài đặt. Nghĩa là mọi key nó chưa biết
 * đều dẫn tới một cú nhảy trang. Vì thế `handleSelect` bên dưới XỬ LÝ TẠI CHỖ
 * và `return` sớm cho ba key động; chỉ key tĩnh mới đi tiếp ra ngoài.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * STORE ĐƯỢC PHÉP ĐỌC Ở ĐÂY
 * ─────────────────────────────────────────────────────────────────────────
 * Widget vẫn KHÔNG đụng `@/app/**` (giữ nguyên tính tái dùng ở showcase/test).
 * Hai store dưới đây là store CỤC BỘ CỦA WIDGET — `header-layout.store.ts`
 * cùng thư mục, `dock-settings.ts` của widget Dock — cùng loại "sở thích hiển
 * thị lưu localStorage", không mang dữ liệu phiên đăng nhập nào.
 *
 * ⛔ Import THẲNG `dock/dock-settings`, KHÔNG qua barrel `@/shared/widgets/dock`:
 *    barrel kéo luôn `Dock.tsx` + `dock.theme.ts` vào chunk của Header chỉ để
 *    đọc một chuỗi `mode` (đúng cảnh báo trong `shared/widgets/index.ts`).
 *
 * Đổi theme thì KHÔNG có store: `ThemeToggle` của kit2 cũng là controlled, và
 * nguồn thật (`useThemeStore`) nằm ở `@/app/store` — widget không được đọc.
 * Vì vậy theme đi vào qua prop, và mục "Chế độ sáng/tối" CHỈ hiện khi nơi gọi
 * truyền đủ `theme` + `onThemeToggle`.
 */
import { createElement, useCallback, useMemo } from 'react';

import type { MenuOption, SystemIconName } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { DEFAULT_DOCK_SETTINGS, useDockSettings } from '@/shared/widgets/dock/dock-settings';

import { HEADER_LAYOUT_LABEL, useHeaderLayoutStore } from '../header-layout.store';
import { USER_MENU_ACTIONS, type UserMenuKey } from './user-menu.constants';

export interface UseUserMenuOptionsParams {
  /** Chế độ màu đang bật. Bỏ trống → KHÔNG hiện mục đổi sáng/tối. */
  theme?: 'light' | 'dark';
  /** Bấm mục đổi sáng/tối. Bỏ trống → KHÔNG hiện mục đó. */
  onThemeToggle?: () => void;
  /** Nhận các key TĨNH (hồ sơ / đổi mật khẩu / đăng xuất). */
  onSelect?: (key: UserMenuKey) => void;
}

/** File `.ts` nên icon dựng bằng `createElement` thay vì JSX. */
const icon = (name: SystemIconName) => createElement(SystemIcon, { name, size: 16 });

const toOption = (action: (typeof USER_MENU_ACTIONS)[number]): MenuOption => ({
  key: action.key,
  label: action.label,
  danger: action.danger,
  icon: icon(action.icon),
});

export function useUserMenuOptions({
  theme,
  onThemeToggle,
  onSelect,
}: UseUserMenuOptionsParams = {}) {
  // Defensive `?.` + fallback: trong lúc HMR / persist rehydrate, selector có
  // thể tạm trả `undefined` và cả mục menu sẽ mất nhãn.
  const dockMode = useDockSettings((s) => s?.mode) ?? DEFAULT_DOCK_SETTINGS.mode;
  const setDockMode = useDockSettings((s) => s?.setMode);
  const isDockHidden = dockMode === 'hidden';

  const headerLayout = useHeaderLayoutStore((s) => s?.layout) ?? 'floating';
  const cycleHeaderLayout = useHeaderLayoutStore((s) => s?.cycleLayout);

  const isDark = theme === 'dark';
  const showTheme = !!theme && !!onThemeToggle;

  const options = useMemo<MenuOption[]>(() => {
    // Nhóm hiển thị nằm GIỮA: tài khoản (hồ sơ · mật khẩu) ở trên, `logout`
    // luôn là mục CUỐI CÙNG — tách bằng key nên thêm mục tĩnh mới không phải
    // sửa lại thứ tự ở đây.
    const display: MenuOption[] = [];

    if (showTheme) {
      display.push({
        key: 'toggle-theme',
        // Nhãn nói ĐÍCH ĐẾN chứ không nói trạng thái hiện tại — khớp tooltip
        // của `<ThemeToggle>` để hai lối vào không mô tả hai kiểu.
        label: isDark ? 'Chế độ sáng' : 'Chế độ tối',
        icon: icon(isDark ? 'sun-bold' : 'moon-bold'),
      });
    }

    display.push({
      key: 'toggle-dock',
      label: isDockHidden ? 'Hiện thanh Dock' : 'Ẩn thanh Dock',
      icon: icon(isDockHidden ? 'eye-outline' : 'eye-slash-outline'),
    });

    display.push({
      key: 'cycle-header-layout',
      // Nhãn hiện kiểu ĐANG dùng; base chỉ có 2 kiểu nên một lần bấm là lật.
      label: `Kiểu header: ${HEADER_LAYOUT_LABEL[headerLayout]}`,
      icon: icon('grid-2-outline'),
    });

    return [
      ...USER_MENU_ACTIONS.filter((a) => a.key !== 'logout').map(toOption),
      ...display,
      ...USER_MENU_ACTIONS.filter((a) => a.key === 'logout').map(toOption),
    ];
  }, [showTheme, isDark, isDockHidden, headerLayout]);

  const handleSelect = useCallback(
    (key: UserMenuKey) => {
      if (key === 'toggle-theme') {
        onThemeToggle?.();
        return;
      }
      if (key === 'toggle-dock') {
        // Hiện lại Dock → về đúng mặc định hệ thống, KHÔNG hard-code `'pinned'`
        // (dự án dẫn xuất có thể đã đổi mặc định — xem `dock-settings.ts`).
        setDockMode?.(isDockHidden ? DEFAULT_DOCK_SETTINGS.mode : 'hidden');
        return;
      }
      if (key === 'cycle-header-layout') {
        cycleHeaderLayout?.();
        return;
      }
      onSelect?.(key);
    },
    [onSelect, onThemeToggle, isDockHidden, setDockMode, cycleHeaderLayout],
  );

  return { options, handleSelect };
}
