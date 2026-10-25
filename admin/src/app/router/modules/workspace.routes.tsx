import type { ModuleConfig } from './types';

/**
 * Workspace — quản trị nhóm làm việc (p1-01). Danh bạ + chi tiết (tổng quan,
 * lưu trữ/khôi phục cấp nền tảng, nhật ký) — xem `src/features/workspace/`.
 * Tab `members`/`channels`/`conversations`/`reports` là khung chờ p1-02/03/05/08.
 */
export const workspaceModule: ModuleConfig = {
  id: 'workspace',
  path: '/workspace',
  title: 'Workspace',
  subtitle: 'Nhóm, thành viên, kênh công khai, báo cáo',
  iconName: 'users-outline',
  color: 'teal',
  order: 20,
  featureFlag: 'communication',
  tabTitles: {
    overview: 'Tổng quan',
    members: 'Thành viên',
    channels: 'Kênh',
    conversations: 'Nhóm chat',
    reports: 'Báo cáo',
    // p2-04: tab chỉ hiện khi cờ `meeting` bật (`WorkspaceDetailPage`) — chỉ METADATA cuộc họp; khai ở đây để tiêu đề tab trình duyệt đúng.
    meetings: 'Cuộc họp',
    // p2-07: tab chỉ hiện khi cờ `meeting` bật + có `meeting:view` (`useWorkspaceTabs`) — chỉ SỐ LIỆU gọi & họp của nhóm.
    media: 'Cuộc gọi & họp',
    // p6-04: tab chỉ hiện khi cờ `wallet` bật (`WorkspaceDetailPage`); khai ở đây để tiêu đề tab trình duyệt đúng.
    wallet: 'Ví (thống kê)',
    // p3-01/p3-02: hai tab chỉ hiện khi cờ `project` bật — chỉ SỐ LIỆU, không tên tệp/tiêu đề thẻ.
    resources: 'Tài liệu',
    projects: 'Dự án',
    // p5-03 §2.4: tab chỉ hiện khi cờ `integration` bật + có `integration:view` — chỉ đọc kết nối (không token).
    integrations: 'Tích hợp',
    // p6-03 §2.2: tab chỉ hiện khi cờ `mentor` bật + có `workspace:view` — bài + đợt cố vấn của nhóm.
    mentor: 'Cố vấn',
  },
  defaultTab: 'overview',
  page: { lazy: () => import('@/features/workspace/pages/WorkspaceListPage') },
  routes: [
    {
      path: ':id',
      title: 'Chi tiết workspace',
      hideInMenu: true,
      lazy: () => import('@/features/workspace/pages/WorkspaceDetailPage'),
    },
  ],
};
