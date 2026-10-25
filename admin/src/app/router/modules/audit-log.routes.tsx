import type { ModuleConfig } from './types';

/**
 * Nhật ký — audit log toàn hệ thống (ai làm gì, khi nào, trên đối tượng nào), chỉ đọc.
 * Xem `src/features/audit-log/`. Quyền vào trang: `audit-log:view`.
 */
export const auditLogModule: ModuleConfig = {
  id: 'audit-log',
  path: '/audit-log',
  title: 'Nhật ký',
  subtitle: 'Mọi thao tác quản trị có lý do',
  iconName: 'history-outline',
  color: 'indigo',
  order: 40,
  page: { lazy: () => import('@/features/audit-log/pages/AuditLogPage') },
  commandPaletteActions: [
    {
      id: 'audit-log.search-actor',
      label: 'Tìm nhật ký theo người thực hiện',
      to: '/audit-log?focus=actor',
    },
  ],
};
