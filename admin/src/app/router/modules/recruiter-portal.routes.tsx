import type { ModuleConfig } from './types';

/**
 * Cổng nhà tuyển dụng — TỰ PHỤC VỤ cho vai `recruiter` (không phải nhân viên vận hành), p6-08. Xem `src/features/recruiter-portal/`. Cùng `id`/`iconName`/`title` hiển thị với `recruiter` (vận hành)
 * là chủ đích: hai module không bao giờ cùng hiện trong một menu vì khác `audience`, nên trùng nhãn không gây nhầm lẫn cho người dùng cuối.
 *
 * Quyền vào `recruiter:view` theo DỮ LIỆU (thành viên doanh nghiệp, kể cả chờ duyệt/tạm ngưng để thấy trạng thái); tìm ứng viên/gửi lời mời còn cần doanh nghiệp APPROVED — do BE (`companyScope`) và
 * màn hình kiểm. Cờ `career` tắt → route trả trang "Chưa bật" (`FeatureGate`). Trang đăng ký doanh nghiệp `/recruiter/signup` là route riêng NGOÀI registry (xem `routes.tsx`).
 */
export const recruiterPortalModule: ModuleConfig = {
  id: 'recruiter-portal',
  path: '/recruiter/portal',
  title: 'Tuyển dụng',
  subtitle: 'Tìm ứng viên, gửi lời mời, quản lý doanh nghiệp',
  iconName: 'building-outline',
  color: 'pink',
  order: 10,
  audience: 'recruiter',
  featureFlag: 'career',
  permission: { resource: 'recruiter', action: 'view' },
  tabTitles: {
    talent: 'Ứng viên',
    offers: 'Lời mời',
    company: 'Công ty',
  },
  defaultTab: 'talent',
  page: { lazy: () => import('@/features/recruiter-portal/pages/RecruiterPortalPage') },
  routes: [
    {
      // Deep link tới ngăn kéo hồ sơ ứng viên — chuyển về `/recruiter/portal?tab=talent&userId=` (giữ danh sách phía sau).
      path: 'talent/:userId',
      title: 'Hồ sơ ứng viên',
      hideInMenu: true,
      lazy: () => import('@/features/recruiter-portal/pages/TalentDetailRedirectPage'),
    },
    {
      // Deep link tới ngăn kéo lời mời — chuyển về `/recruiter/portal?tab=offers&offerId=`.
      path: 'offers/:id',
      title: 'Chi tiết lời mời',
      hideInMenu: true,
      lazy: () => import('@/features/recruiter-portal/pages/OfferDetailRedirectPage'),
    },
  ],
};
