import type { ModuleConfig } from './types';

/**
 * Tuyển dụng — VẬN HÀNH (duyệt doanh nghiệp, thống kê, xử lý báo cáo), vai `ops` (p6-08). Xem `src/features/recruiter/`.
 * Khác `recruiter-portal` — cổng tự phục vụ cho vai `recruiter`.
 *
 * Quyền vào `recruiter:view` (mặc định theo `id`); duyệt/từ chối/tạm ngưng/khôi phục `recruiter:approve`, đổi gói/hạn mức/thông tin `recruiter:update` —
 * các quyền đó do chính màn hình kiểm. Tab `reports` dùng lại hàng đợi báo cáo nên ẩn khi thiếu `moderation:view`.
 * Cờ `career` tắt → route trả trang "Chưa bật" (`FeatureGate`).
 */
export const recruiterModule: ModuleConfig = {
  id: 'recruiter',
  path: '/recruiter',
  title: 'Tuyển dụng',
  subtitle: 'Duyệt doanh nghiệp, hạn mức lời mời, báo cáo vi phạm',
  iconName: 'building-outline',
  color: 'pink',
  order: 100,
  featureFlag: 'career',
  tabTitles: {
    companies: 'Doanh nghiệp',
    stats: 'Thống kê',
    reports: 'Báo cáo',
  },
  defaultTab: 'companies',
  page: { lazy: () => import('@/features/recruiter/pages/RecruiterOpsPage') },
  routes: [
    {
      // Deep link tới ngăn kéo doanh nghiệp — chuyển về `/recruiter?tab=companies&companyId=` (giữ danh sách phía sau).
      path: 'companies/:id',
      title: 'Chi tiết doanh nghiệp',
      hideInMenu: true,
      lazy: () => import('@/features/recruiter/pages/CompanyDetailRedirectPage'),
    },
  ],
};
