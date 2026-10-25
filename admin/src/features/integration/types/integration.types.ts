/**
 * Kiểu dữ liệu admin tích hợp — đối chiếu TAY với `be/src/modules/integrations/services/integration-admin.service.ts`
 * (`AdminEventRow`, `AdminEventDetail`, `AdminProviderRow`, `AdminConnectionRow`). BE là nguồn thật.
 */

/** Nhà cung cấp theo enum `WebhookProvider` của log sự kiện (Google Calendar ghi là `GOOGLE`). */
export type WebhookProvider = 'GITHUB' | 'GITLAB' | 'GOOGLE' | 'FIGMA';
/** Nhà cung cấp theo enum `IntegrationProvider` (kết nối, bật/tắt). */
export type IntegrationProvider = 'GITHUB' | 'GITLAB' | 'GOOGLE_CALENDAR' | 'FIGMA';
export type WebhookEventStatus = 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED';
export type IntegrationStatus = 'ACTIVE' | 'ERROR' | 'REVOKED' | 'DISABLED';

export interface WorkspaceRef {
  id: string;
  name: string;
}

export interface AdminWebhookEvent {
  id: string;
  provider: WebhookProvider;
  eventId: string;
  type: string;
  summary: string | null;
  status: WebhookEventStatus;
  error: string | null;
  receivedAt: string;
  processedAt: string | null;
  replayOf: string | null;
  hasMessage: boolean;
  /** Còn payload trong thời gian lưu → phát lại được. */
  replayable: boolean;
  integrationId: string | null;
  workspace: WorkspaceRef | null;
}

export interface AdminWebhookEventDetail extends AdminWebhookEvent {
  /** Payload ĐÃ CHE phía BE (token/secret/email → `***`); `null` khi đã quá thời gian lưu. */
  payload: unknown;
  attempts: number;
  /** Tin hệ thống đã tạo: tên kênh CHỈ khi kênh công khai. */
  message: { id: string; channel: { name: string | null; private: boolean } | null } | null;
  replays: Array<{ id: string; eventId: string; status: WebhookEventStatus; receivedAt: string }>;
}

export interface AdminEventsParams {
  page: number;
  limit: number;
  provider?: WebhookProvider;
  status?: WebhookEventStatus;
  workspaceId?: string;
  from?: string;
  to?: string;
}

export interface AdminProviderRow {
  provider: IntegrationProvider;
  key: string;
  label: string;
  kind: 'WORKSPACE' | 'USER';
  /** Đủ khoá env ở server (chỉ đọc — không hiện giá trị). */
  configured: boolean;
  enabled: boolean;
  available: boolean;
  events: string[];
  connections: { active: number; error: number; revoked: number };
  events24h: number;
  lastError: { message: string; at: string } | null;
}

export interface ToggleProviderPayload {
  provider: IntegrationProvider;
  enabled: boolean;
  reason: string;
}

export interface AdminConnection {
  id: string;
  workspace: WorkspaceRef | null;
  provider: IntegrationProvider;
  externalName: string;
  status: IntegrationStatus;
  statusReason: string | null;
  createdBy: { id: string; name: string | null };
  lastEventAt: string | null;
  updatedAt: string;
}

/** Kênh nhận của kết nối: `CHANNEL` (kênh) hoặc `CONVERSATION` (nhóm chat). Tên CHỈ khi kênh công khai — kênh riêng tư `name = null`, `private = true`. */
export interface IntegrationTarget {
  scopeType: 'CHANNEL' | 'CONVERSATION';
  name: string | null;
  private: boolean;
}

/** Một kết nối trong tab "Tích hợp" của workspace — `listForWorkspace` của BE (`AdminConnectionRow` + `target`). Không có token/cấu hình. */
export interface AdminWorkspaceConnection extends AdminConnection {
  target: IntegrationTarget;
}

export interface AdminConnectionsParams {
  page: number;
  limit: number;
  /** Nhiều giá trị ngăn dấu phẩy (`ERROR,REVOKED`) — mặc định BE lấy ERROR + REVOKED. */
  status?: string;
  provider?: IntegrationProvider;
}
