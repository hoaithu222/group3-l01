import { memo, useMemo } from 'react';

import { useAccessibleModules } from '@/app/router/permission';
import { appConfig } from '@/core/config';
import { Dock } from '@/shared/widgets/dock';
import type { DockItemConfig } from '@/shared/widgets/dock';

import { listVisibleModules } from './app-dock.utils';
import { useModuleBadges } from './useModuleBadges';

/**
 * Nối `<Dock>` với MODULE_REGISTRY, đã lọc theo quyền.
 *
 * Dùng CHUNG `useAccessibleModules` với `PermissionGuard` để menu và guard
 * không bao giờ nói khác nhau — nếu mỗi bên tự lọc thì sẽ có ngày Dock hiện
 * một mục mà bấm vào ra 403. Nhánh dự phòng khi kiểm đăng nhập đang tắt
 * (`listVisibleModules`) và lý do của nó nằm ở `app-dock.utils.ts`.
 *
 * Chấm số việc chờ (vd báo cáo kiểm duyệt) lấy từ `useModuleBadges(modules)` — chỉ tính cho mục
 * ĐÃ qua bộ lọc quyền ở trên.
 */
const AppDock = memo(function AppDock() {
  const modules = useAccessibleModules();
  const badges = useModuleBadges(modules);

  const items = useMemo<DockItemConfig[]>(() => {
    const source = modules.length > 0 || appConfig.authEnabled ? modules : listVisibleModules();

    return source.map((m) => ({
      id: m.id,
      label: m.title,
      icon: m.iconName,
      href: m.landingPath ?? m.path,
      badge: badges[m.id]?.count,
      badgeLabel: badges[m.id]?.label,
    }));
  }, [modules, badges]);

  return <Dock items={items} />;
});

export default AppDock;
