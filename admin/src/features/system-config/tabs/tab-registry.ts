import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Đăng ký tab của trang `system-config` — MỘT dòng cho mỗi tab.
 *
 * Trang hiện tab khi khoá xuất hiện ở CẢ HAI nơi: `tabTitles` của
 * `system-config.routes.tsx` (nhãn + tiêu đề tab trình duyệt) và bảng này
 * (component). Có nhãn mà chưa có component ⇒ tab ẩn, không hiện tab rỗng.
 *
 * Thêm tab mới (p0-04 `jobs`, p0-05 `storage`, p0-06 `notifications`, p0-08
 * `media`): thêm một dòng ở đây, không sửa `SystemConfigPage`.
 */
export interface SystemConfigTabDef {
  component: LazyExoticComponent<ComponentType>;
  /**
   * Tên cờ trong `capabilities.features` — cờ tắt thì tab hiện
   * `FeatureDisabledPage` (bọc `FeatureGate`). Bỏ trống = luôn mở.
   */
  featureFlag?: string;
}

export const SYSTEM_CONFIG_TABS: Readonly<Record<string, SystemConfigTabDef>> = {
  limits: { component: lazy(() => import('./LimitsTab')) },
  features: { component: lazy(() => import('./FeaturesTab')) },
  // p0-07/p0-13: cờ xác thực (sinh trắc học, khoá ứng dụng). KHÔNG `featureFlag` — không thuộc phân hệ nào; cờ nằm ở khoá registry `auth`.
  auth: { component: lazy(() => import('./AuthTab')) },
  // p5-04: mẫu workspace (xem/sửa nội dung, bật/tắt, đổi thứ tự). KHÔNG `featureFlag` — BE `/admin/workspace-templates` chỉ cần quyền
  // `system-config:view|update`, và cờ phụ `workspaceTemplates` chỉ ẩn tính năng với người dùng cuối, không phải màn quản trị.
  templates: { component: lazy(() => import('../templates/TemplatesTab')) },
  notifications: { component: lazy(() => import('../notifications/NotificationsTab')) },
  jobs: { component: lazy(() => import('../jobs/JobsTab')) },
  storage: { component: lazy(() => import('../storage/StorageTab')) },
  // p0-08: sức khoẻ máy chủ media (LiveKit). KHÔNG `featureFlag` — tab luôn mở để vận hành kiểm hạ tầng trước khi bật cờ voice/meeting.
  media: { component: lazy(() => import('../media/MediaTab')) },
  // p3-02: giới hạn bảng/thẻ + mẫu cột mặc định (field `json`). Cờ `project` tắt → khung "tính năng chưa bật".
  pm: { component: lazy(() => import('../pm/PmTab')), featureFlag: 'project' },
  // p7-05: quét trùng lặp nội bộ — thống kê ẩn danh + cấu hình ngưỡng/boilerplate + lập chỉ mục lại. Cờ `plagiarism` tắt → khung "tính năng chưa bật".
  plagiarism: { component: lazy(() => import('../../plagiarism/pages/PlagiarismTab')), featureFlag: 'plagiarism' },
};
