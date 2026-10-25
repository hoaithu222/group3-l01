import { ADMIN_ACTION_ORDER } from '../constants/moderation.constants';
import type { AdminReportAction, AdminReportGroup } from '../types/moderation.types';

export interface ActionPermissions {
  /** `moderation:update` — không có thì không hành động nào hiện. */
  canUpdate: boolean;
  /** `user:update` — `LOCK_AUTHOR` cần thêm quyền này (vai `manager` không có). */
  canLockUser: boolean;
}

type ActionTarget = Pick<AdminReportGroup, 'targetType' | 'scope'>;

/**
 * Hành động có ÁP DỤNG cho loại đích không — khớp `assertApplicable` của BE
 * (`platform-moderation.service.ts`, sai loại → 400 `MOD_003`); `ARCHIVE_CHANNEL` hẹp hơn BE một
 * bậc: kênh riêng tư bị BE chặn (`CH_012` "Không thao tác cấp nền tảng trên kênh riêng tư"), nên
 * không mời bấm để nhận lỗi.
 */
function isApplicable(action: AdminReportAction, { targetType, scope }: ActionTarget): boolean {
  // p6-08 `COMPANY`/`JOB_OFFER`: chỉ "Bỏ qua" và "Cảnh cáo" (ghi nhật ký) ở khối Quyết định — KHÔNG khoá tài khoản HR từ báo cáo (BE cho phép nhưng đó không phải
  // cách xử lý doanh nghiệp/lời mời); tạm ngưng doanh nghiệp và thu hồi lời mời là hành động riêng ở `CompanyTargetPanel`/`JobOfferTargetPanel`.
  if (targetType === 'COMPANY' || targetType === 'JOB_OFFER') {
    return action === 'DISMISS' || action === 'WARN_AUTHOR';
  }
  switch (action) {
    case 'DISMISS':
      return true;
    case 'REMOVE_CONTENT':
      return targetType === 'MESSAGE';
    case 'WARN_AUTHOR':
    case 'LOCK_AUTHOR':
      // BE cho cả `STUDY_SET` (p4-01): tác giả = chủ bộ học (`targetAuthorId`).
      // p6-03 `MENTOR_POST`: tác giả = người đăng bài (`targetAuthorId`).
      // p6-07 `PORTFOLIO`: tác giả = chủ hồ sơ (`targetAuthorId`); gỡ trang là hành động riêng ở `PortfolioTakedownActions`, không phải `REMOVE_CONTENT`.
      return (
        targetType === 'MESSAGE' ||
        targetType === 'USER' ||
        targetType === 'STUDY_SET' ||
        targetType === 'MENTOR_POST' ||
        targetType === 'PORTFOLIO'
      );
    case 'ARCHIVE_CHANNEL':
      return targetType === 'CHANNEL' && !scope.isPrivate;
    case 'DISSOLVE_CONVERSATION':
      return targetType === 'CONVERSATION';
  }
}

/**
 * Hành động hiển thị cho một nhóm báo cáo: ẨN (không phải chỉ vô hiệu) những gì không hợp loại
 * đích hoặc thiếu quyền — bấm rồi mới nhận 403/400 là trải nghiệm tệ.
 */
export function availableActions(
  group: ActionTarget,
  { canUpdate, canLockUser }: ActionPermissions,
): AdminReportAction[] {
  if (!canUpdate) return [];
  return ADMIN_ACTION_ORDER.filter(
    (action) => isApplicable(action, group) && (action !== 'LOCK_AUTHOR' || canLockUser),
  );
}
