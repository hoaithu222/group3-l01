import { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { PATHS } from '@/app/config';
import { useAccessibleModules, useModuleCommandActions } from '@/app/router/permission';
import { useThemeStore } from '@/app/store';
import { useCommandPaletteShortcut } from '@/shared/hooks';
import { CommandPalette, useCommandPaletteStore } from '@/shared/widgets/command-palette';
import type { CommandPaletteGroup } from '@/shared/widgets/command-palette';

/**
 * Nối `<CommandPalette>` (widget thuần) với MODULE_REGISTRY + PATHS + store
 * theme của app — cùng vai trò với `AppHeader.tsx` / `AppDock.tsx`.
 *
 * Dùng CHUNG `useAccessibleModules` với `AppDock`/`PermissionGuard` để danh
 * sách phân hệ trong palette không bao giờ nói khác Dock — nếu mỗi bên tự lọc
 * quyền riêng thì sẽ có ngày palette gợi ý một phân hệ mà bấm vào ra 403.
 */
const AppCommandPalette = memo(function AppCommandPalette() {
  const navigate = useNavigate();
  const modules = useAccessibleModules();
  const moduleActions = useModuleCommandActions();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const toggleOpen = useCommandPaletteStore((s) => s.toggle);

  // Mount ĐÚNG MỘT LẦN ở gốc layout (`BackgroundLayout.tsx`) nên phím tắt
  // toàn cục chỉ bind một lần duy nhất — không nhân bản listener theo route.
  useCommandPaletteShortcut(toggleOpen);

  const groups = useMemo<CommandPaletteGroup[]>(
    () => [
      {
        label: 'Điều hướng chung',
        items: [
          {
            id: 'home',
            label: 'Trang chủ',
            iconName: 'house-outline',
            onSelect: () => navigate(PATHS.HOME),
          },
          {
            id: 'profile',
            label: 'Hồ sơ cá nhân',
            iconName: 'user-outline',
            onSelect: () => navigate(PATHS.PROFILE),
          },
          {
            id: 'settings',
            label: 'Cài đặt',
            iconName: 'gear-outline',
            onSelect: () => navigate(PATHS.SETTINGS),
          },
        ],
      },
      {
        label: 'Phân hệ',
        items: modules.map((m) => ({
          id: m.id,
          label: m.title,
          description: m.subtitle,
          iconName: m.iconName,
          onSelect: () => navigate(m.landingPath ?? m.path),
        })),
      },
      {
        // Khai ở `ModuleConfig.commandPaletteActions` (registry) — KHÔNG khai riêng ở đây.
        label: 'Hành động nhanh',
        items: moduleActions.map((a) => ({
          id: a.id,
          label: a.label,
          description: a.moduleTitle,
          iconName: a.iconName,
          onSelect: () => navigate(a.to),
        })),
      },
      {
        label: 'Giao diện',
        items: [
          {
            id: 'toggle-theme',
            label: theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối',
            iconName: theme === 'dark' ? 'sun-bold' : 'moon-bold',
            onSelect: toggleTheme,
          },
        ],
      },
    ],
    [modules, moduleActions, navigate, theme, toggleTheme],
  );

  return <CommandPalette groups={groups} />;
});

export default AppCommandPalette;
