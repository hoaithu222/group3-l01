/**
 * MODULE REGISTRY — nguồn khai báo DUY NHẤT cho mọi phân hệ.
 *
 * Thêm phân hệ mới:
 *   1. Tạo `src/app/router/modules/{id}.routes.tsx` export một `ModuleConfig`
 *   2. Import và thêm vào mảng dưới đây
 *
 * Route, menu Dock, breadcrumb và `PermissionGuard` tự đồng bộ theo — KHÔNG
 * phải sửa chỗ nào khác.
 *
 * Mẫu một file `{id}.routes.tsx`:
 *
 * ```tsx
 * import type { ModuleConfig } from './types';
 *
 * export const userModule: ModuleConfig = {
 *   id: 'user',                      // cũng là `resource` khi kiểm quyền
 *   path: '/user',
 *   title: 'Người dùng',
 *   subtitle: 'Quản lý tài khoản và phân quyền',
 *   iconName: 'user-outline',
 *   color: 'blue',
 *   order: 10,
 *   page: { lazy: () => import('@/features/user/pages/UserPage') },
 *   routes: [
 *     {
 *       path: ':id',
 *       title: 'Chi tiết người dùng',
 *       lazy: () => import('@/features/user/pages/UserDetailPage'),
 *     },
 *   ],
 * };
 * ```
 *
 * Chưa có page thật thì trỏ tạm `page: { lazy: placeholderPage }`
 * (xem `module-defaults.ts`) — KHÔNG xoá entry khỏi registry.
 */

import { aiJobModule } from './ai-job.routes';
import { auditLogModule } from './audit-log.routes';
import { gamificationModule } from './gamification.routes';
import { integrationModule } from './integration.routes';
import { meetingModule } from './meeting.routes';
import { moderationModule } from './moderation.routes';
import { o2oModule } from './o2o.routes';
import { partnerModule } from './partner.routes';
import { recruiterModule } from './recruiter.routes';
import { recruiterPortalModule } from './recruiter-portal.routes';
import { roadmapModule } from './roadmap.routes';
import { skillModule } from './skill.routes';
import { systemConfigModule } from './system-config.routes';
import type { ModuleConfig } from './types';
import { userModule } from './user.routes';
import { workspaceModule } from './workspace.routes';

export const MODULE_REGISTRY: ModuleConfig[] = [
  userModule,
  workspaceModule,
  meetingModule,
  moderationModule,
  auditLogModule,
  systemConfigModule,
  gamificationModule,
  roadmapModule,
  aiJobModule,
  integrationModule,
  skillModule,
  recruiterModule,
  recruiterPortalModule,
  o2oModule,
  partnerModule,
];

/**
 * Bản đồ `ID_PHÂN_HỆ → path`, sinh tự động từ registry.
 *
 * Nhờ vậy đổi `path` của một phân hệ chỉ phải sửa đúng entry của nó; mọi chỗ
 * dùng `PATHS.<ID>` trong UI tự đi theo.
 */
export const MODULE_PATHS = Object.fromEntries(
  MODULE_REGISTRY.map((m) => [m.id.toUpperCase().replace(/-/g, '_'), m.path]),
) as Record<string, string>;

/** Tra phân hệ theo id — dùng cho breadcrumb, tiêu đề tab, menu. */
export const MODULE_BY_ID: Readonly<Record<string, ModuleConfig>> = Object.fromEntries(
  MODULE_REGISTRY.map((m) => [m.id, m]),
);

/** Tra phân hệ theo path gốc — dùng để biết URL hiện tại thuộc phân hệ nào. */
export const MODULE_BY_PATH: Readonly<Record<string, ModuleConfig>> = Object.fromEntries(
  MODULE_REGISTRY.map((m) => [m.path, m]),
);
