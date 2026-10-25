import type {
  IntegrationProvider,
  IntegrationStatus,
  WebhookEventStatus,
  WebhookProvider,
} from '../types/integration.types';

/** Nhãn + màu `<Badge>` cho trạng thái (chữ + màu — không chỉ dựa vào màu). */
export interface StatusMeta {
  label: string;
  color: 'success' | 'warning' | 'error' | 'neutral' | 'info';
}

export const EVENTS_PAGE_SIZE = 50;
export const CONNECTIONS_PAGE_SIZE = 20;

export const WEBHOOK_PROVIDER_LABELS: Record<WebhookProvider, string> = {
  GITHUB: 'GitHub',
  GITLAB: 'GitLab',
  GOOGLE: 'Google Calendar',
  FIGMA: 'Figma',
};

export const INTEGRATION_PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  GITHUB: 'GitHub',
  GITLAB: 'GitLab',
  GOOGLE_CALENDAR: 'Google Calendar',
  FIGMA: 'Figma',
};

export const WEBHOOK_STATUS_META: Record<WebhookEventStatus, StatusMeta> = {
  RECEIVED: { label: 'Đã nhận', color: 'info' },
  PROCESSED: { label: 'Đã xử lý', color: 'success' },
  IGNORED: { label: 'Bỏ qua', color: 'neutral' },
  FAILED: { label: 'Lỗi', color: 'error' },
};

export const CONNECTION_STATUS_META: Record<IntegrationStatus, StatusMeta> = {
  ACTIVE: { label: 'Đang hoạt động', color: 'success' },
  ERROR: { label: 'Lỗi', color: 'error' },
  REVOKED: { label: 'Đã thu hồi', color: 'warning' },
  DISABLED: { label: 'Đã tắt', color: 'neutral' },
};

/** `Integration.statusReason` (BE `INTEGRATION_STATUS_REASONS`) → câu tiếng Việt; lý do lạ → chính mã. */
export const STATUS_REASON_LABELS: Record<string, string> = {
  TARGET_FORBIDDEN: 'Người cấu hình không còn quyền đăng vào kênh nhận',
  TARGET_ARCHIVED: 'Kênh nhận không còn khả dụng',
  PROVIDER_REVOKED: 'Ứng dụng đã bị gỡ ở nhà cung cấp',
  PROVIDER_SUSPENDED: 'Cài đặt đang bị tạm ngưng ở nhà cung cấp',
  TOKEN_INVALID: 'Token hết hạn hoặc bị thu hồi',
  HOOK_MISSING: 'Webhook ở nhà cung cấp đã bị xoá',
  DISCONNECTED: 'Đã ngắt kết nối',
};

export const statusReasonLabel = (reason: string | null): string =>
  reason ? (STATUS_REASON_LABELS[reason] ?? reason) : '—';

/** Loại sự kiện → nhãn ngắn (mã gốc vẫn hiện bên dưới để tra cứu). */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  push: 'Push',
  pull_request: 'Pull request',
  issues: 'Issue',
  release: 'Release',
  merge_request: 'Merge request',
  note: 'Bình luận',
  installation: 'Cài đặt ứng dụng',
  FILE_UPDATE: 'Cập nhật file',
  FILE_COMMENT: 'Bình luận file',
};

/** Ô lọc "tất cả" — Radix Select không nhận giá trị rỗng. */
export const ALL_FILTER = 'all';

export const PROVIDER_FILTER_OPTIONS = [
  { value: ALL_FILTER, label: 'Mọi nhà cung cấp' },
  ...(Object.entries(WEBHOOK_PROVIDER_LABELS) as Array<[WebhookProvider, string]>).map(
    ([value, label]) => ({ value, label }),
  ),
];

export const STATUS_FILTER_OPTIONS = [
  { value: ALL_FILTER, label: 'Mọi trạng thái' },
  ...(Object.entries(WEBHOOK_STATUS_META) as Array<[WebhookEventStatus, StatusMeta]>).map(
    ([value, m]) => ({ value, label: m.label }),
  ),
];

export const CONNECTION_STATUS_FILTER_OPTIONS = [
  { value: 'ERROR,REVOKED', label: 'Lỗi + đã thu hồi' },
  { value: 'ERROR', label: 'Chỉ lỗi' },
  { value: 'REVOKED', label: 'Chỉ đã thu hồi' },
];

export const WEBHOOK_PROVIDERS = Object.keys(WEBHOOK_PROVIDER_LABELS) as WebhookProvider[];
export const WEBHOOK_STATUSES = Object.keys(WEBHOOK_STATUS_META) as WebhookEventStatus[];
