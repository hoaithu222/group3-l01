import type { BadgeVariant } from '@/shared/ui/badge';
import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import type {
  IntegrationProvider,
  IntegrationStatus,
  IntegrationTarget,
  WebhookEventStatus,
} from '../api/integrations.types';

/**
 * Nơi nhận tin của một kết nối, bằng CHỮ: kênh → `#tên`, nhóm chat → `Nhóm chat · tên`. `name === null` là đích người xem không đọc được
 * (kênh/nhóm chat riêng tư) — không lộ tên, chỉ nói loại.
 */
export function targetLabel(target: Pick<IntegrationTarget, 'name' | 'scopeType'>): string {
  if (target.scopeType === 'CONVERSATION') {
    return target.name ? `Nhóm chat · ${target.name}` : 'Nhóm chat riêng tư';
  }
  return target.name ? `#${target.name}` : 'Kênh riêng tư';
}

export const PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  GITHUB: 'GitHub',
  GITLAB: 'GitLab',
  GOOGLE_CALENDAR: 'Google Calendar',
  FIGMA: 'Figma',
};

export const PROVIDER_DESCRIPTIONS: Record<IntegrationProvider, string> = {
  GITHUB: 'Thông báo push, pull request, issue và release vào kênh của nhóm.',
  GITLAB: 'Thông báo push, merge request, issue, bình luận và release.',
  GOOGLE_CALENDAR: 'Cuộc họp bạn tham dự được thêm vào Google Calendar.',
  FIGMA: 'Thông báo khi file Figma được cập nhật hoặc có bình luận mới.',
};

/**
 * Ô icon nhà cung cấp (thẻ Marketplace, hàng tích hợp cá nhân). ⚠️ Bộ icon KHÔNG có logo GitHub/GitLab/Figma/Google (chỉ có
 * logo ngân hàng `bank/*`) — dùng icon gần nghĩa + tông riêng cho từng nhà: kho mã = `document`/`document-2`, thiết kế =
 * `magic-wand-01`, lịch = `calendar` (tông `info` như phân hệ Lịch họp). ⛔ Đừng tự vẽ logo (`shared/ui/AGENTS.md`).
 */
export const PROVIDER_ART: Record<IntegrationProvider, { icon: IconName; tone: IconTileTone }> = {
  FIGMA: { icon: 'magic-wand-01', tone: 'accent' },
  GITHUB: { icon: 'document', tone: 'brand' },
  GITLAB: { icon: 'document-2', tone: 'warning' },
  GOOGLE_CALENDAR: { icon: 'calendar', tone: 'info' },
};

/** Ô icon theo trạng thái kết nối — đi CÙNG chữ của `STATUS_META` (màu không phải dấu hiệu duy nhất). */
export const STATUS_ART: Record<IntegrationStatus, { icon: IconName; tone: IconTileTone }> = {
  ACTIVE: { icon: 'checkmark-circle', tone: 'success' },
  DISABLED: { icon: 'noti-off', tone: 'neutral' },
  ERROR: { icon: 'alert-warning', tone: 'danger' },
  REVOKED: { icon: 'unlink', tone: 'warning' },
};

/** Trạng thái bằng CHỮ (không chỉ dựa vào màu) + tông badge. */
export const STATUS_META: Record<
  IntegrationStatus,
  { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }
> = {
  ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
  ERROR: { label: 'Lỗi', tone: 'danger' },
  REVOKED: { label: 'Đã thu hồi', tone: 'warning' },
  DISABLED: { label: 'Đã tắt', tone: 'neutral' },
};

/** Tông `Badge` cho trạng thái sự kiện — đi kèm chữ của `EVENT_STATUS_LABELS` (màu không phải dấu hiệu duy nhất). */
export const EVENT_STATUS_BADGE: Record<WebhookEventStatus, BadgeVariant> = {
  FAILED: 'error',
  IGNORED: 'neutral',
  PROCESSED: 'success',
  RECEIVED: 'info',
};

export const EVENT_STATUS_LABELS: Record<WebhookEventStatus, string> = {
  RECEIVED: 'Đang xử lý',
  PROCESSED: 'Đã đăng tin',
  IGNORED: 'Bỏ qua',
  FAILED: 'Lỗi',
};

/** `statusReason` (BE `INTEGRATION_STATUS_REASONS`) → câu hướng dẫn; lý do lạ → câu chung. */
const REASON_LABELS: Record<string, string> = {
  TARGET_FORBIDDEN:
    'Người cấu hình không còn quyền đăng vào nơi nhận — chọn lại kênh hoặc nhóm chat.',
  TARGET_ARCHIVED: 'Kênh hoặc nhóm chat nhận đã lưu trữ hay không còn — chọn nơi nhận khác.',
  PROVIDER_REVOKED: 'Ứng dụng đã bị gỡ ở nhà cung cấp — hãy kết nối lại.',
  PROVIDER_SUSPENDED: 'Cài đặt đang bị tạm ngưng ở nhà cung cấp.',
  TOKEN_INVALID: 'Kết nối đã hết hạn hoặc bị thu hồi — hãy kết nối lại.',
  HOOK_MISSING: 'Webhook ở nhà cung cấp đã bị xoá — hãy kết nối lại.',
};

export function statusReasonText(reason: string | null): string {
  return (reason && REASON_LABELS[reason]) || 'Kết nối cần được kiểm tra.';
}

/** Loại sự kiện chọn theo dõi (giá trị trong `config.events`). */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  push: 'Push commit',
  pull_request: 'Pull request',
  issues: 'Issue',
  release: 'Release',
  merge_request: 'Merge request',
  note: 'Bình luận',
  FILE_UPDATE: 'Cập nhật file',
  FILE_COMMENT: 'Bình luận file',
};

/** Mã lỗi trả về qua deep link callback (`status=error&code=`) → câu hiển thị. */
const CALLBACK_ERRORS: Record<string, string> = {
  INT_001: 'Nhà cung cấp này chưa được bật.',
  INT_002: 'Nhóm đã đạt số tích hợp tối đa.',
  INT_003: 'Phiên kết nối đã hết hạn, vui lòng thử lại.',
  INT_004: 'Không lấy được dữ liệu từ nhà cung cấp, thử lại sau.',
  INT_005: 'Bạn không có quyền đăng vào kênh mặc định của nhóm.',
  INT_008: 'Tài khoản này đã được kết nối với nhóm khác.',
  AUTH_005: 'Bạn không có quyền kết nối tích hợp cho nhóm này.',
  PERM_001: 'Bạn không có quyền kết nối tích hợp cho nhóm này.',
};

export function callbackErrorText(code: string | null): string {
  return (code && CALLBACK_ERRORS[code]) || 'Không kết nối được. Vui lòng thử lại.';
}
