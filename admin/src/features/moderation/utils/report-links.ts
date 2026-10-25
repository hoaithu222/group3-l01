import { MODERATION_BASE_PATH } from '../constants/moderation.constants';
import type { AdminReportGroup } from '../types/moderation.types';

/** `id` từ BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#` vào URL nội bộ. */
const seg = encodeURIComponent;

export const reportDetailPath = (reportId: string): string =>
  `${MODERATION_BASE_PATH}/${seg(reportId)}`;

/**
 * Viết thẳng path (không import `MODULE_PATHS` — xem `MODERATION_BASE_PATH`). Khớp
 * `user.routes.tsx` / `workspace.routes.tsx`.
 */
export const userDetailPath = (userId: string): string => `/user/${seg(userId)}`;
export const workspaceDetailPath = (workspaceId: string): string =>
  `/workspace/${seg(workspaceId)}`;

/** State đi kèm `<Link>` sang trang chi tiết: nơi để quay lại (giữ nguyên bộ lọc hàng đợi). */
export interface ReportNavState {
  from?: string;
}

/**
 * Đích quay lại từ `location.state` — chỉ nhận đường dẫn NỘI BỘ (bắt đầu bằng một `/`, không
 * phải `//host`); mở chi tiết ở tab mới thì không có state → về hàng đợi mặc định.
 */
export function returnPathFrom(state: unknown, fallback: string): string {
  const from = (state as ReportNavState | null | undefined)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
    ? from
    : fallback;
}

/**
 * Nhãn phạm vi của một nhóm báo cáo. TÊN chỉ hiện với kênh public — kênh riêng tư/nhóm chat/1-1
 * không bao giờ hiện tên ở hàng đợi (README p1-08 §6), kể cả khi payload lỡ mang theo.
 * 1-1 suy từ "tin trong hội thoại nhưng không thuộc workspace nào" (BE không có cờ riêng).
 */
export function scopeLabel(
  group: Pick<AdminReportGroup, 'targetType' | 'scope' | 'workspace'>,
): string {
  const { scope } = group;
  // Bộ học không có kênh/nhóm chat: có workspace ⇔ bộ WORKSPACE (BE chỉ gắn `workspaceId` cho phạm vi này).
  if (group.targetType === 'STUDY_SET')
    return group.workspace ? 'Bộ học trong nhóm' : 'Bộ học công khai';
  // p6-03: bài tìm cố vấn nằm trên bảng tin công khai (người đăng nhập), không thuộc kênh/nhóm chat.
  if (group.targetType === 'MENTOR_POST') return 'Bảng tin cố vấn';
  // p6-07: trang portfolio công khai (`/p/<slug>`), không thuộc kênh/nhóm chat/workspace nào.
  if (group.targetType === 'PORTFOLIO') return 'Trang portfolio công khai';
  // p6-08: doanh nghiệp / lời mời tuyển dụng không thuộc kênh/nhóm chat/workspace nào.
  if (group.targetType === 'COMPANY') return 'Doanh nghiệp tuyển dụng';
  if (group.targetType === 'JOB_OFFER') return 'Lời mời tuyển dụng';
  if (scope.type === null) return '—';
  if (scope.type === 'CHANNEL') {
    if (scope.isPrivate) return 'Kênh riêng tư';
    return scope.name ? `#${scope.name}` : 'Kênh công khai';
  }
  return group.targetType === 'MESSAGE' && !group.workspace ? 'Tin nhắn 1-1' : 'Nhóm chat';
}
