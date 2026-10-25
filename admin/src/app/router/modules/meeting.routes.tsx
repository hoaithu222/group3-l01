import type { ModuleConfig } from './types';

/**
 * Gọi & họp — vận hành TOÀN NỀN TẢNG (p2-07): bảng cuộc họp, bảng cuộc gọi + thống kê, ghi hình (dùng lại tab của workspace), sức khoẻ hạ tầng media, và
 * "Kết thúc khẩn cấp" cuộc họp/cuộc gọi (có lý do + audit). CHỈ metadata vận hành (OPC-05: không agenda, người tham dự, nội dung). Xem `src/features/meeting/`.
 *
 * Quyền vào: `meeting:view` (mặc định theo `id`); kết thúc khẩn cấp `meeting:update`, xoá bản ghi hình `meeting:delete` — kiểm ở từng tab. Cờ `meeting`
 * tắt → route trả trang "Chưa bật" (`FeatureGate`); tab "Cuộc gọi" ẩn thêm khi cờ `voice` tắt (`MeetingOpsPage`).
 *
 * `order: 25` — ngay sau `workspace` (20), trước `moderation` (30).
 */
export const meetingModule: ModuleConfig = {
  id: 'meeting',
  path: '/meeting',
  title: 'Gọi & họp',
  subtitle: 'Cuộc họp, cuộc gọi, ghi hình, hạ tầng media',
  iconName: 'phone-outline',
  color: 'fuchsia',
  order: 25,
  featureFlag: 'meeting',
  tabTitles: {
    meetings: 'Cuộc họp',
    calls: 'Cuộc gọi',
    recordings: 'Ghi hình',
    infra: 'Hạ tầng media',
  },
  defaultTab: 'meetings',
  page: { lazy: () => import('@/features/meeting/pages/MeetingOpsPage') },
};
