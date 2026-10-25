/**
 * Kiểu DTO tích hợp (p5-03) — đối chiếu TAY với `be/src/modules/integrations/services/integration.presenter.ts`,
 * `provider-availability.ts`, `integration-events.service.ts`. BE là nguồn thật; KHÔNG có trường token/secret nào (INT-08).
 */
export type IntegrationProvider = 'GITHUB' | 'GITLAB' | 'GOOGLE_CALENDAR' | 'FIGMA';
export type IntegrationProviderKey = 'github' | 'gitlab' | 'google-calendar' | 'figma';
export type IntegrationStatus = 'ACTIVE' | 'ERROR' | 'REVOKED' | 'DISABLED';
export type WebhookEventStatus = 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED';

export interface ProviderInfo {
  provider: IntegrationProvider;
  key: IntegrationProviderKey;
  label: string;
  kind: 'WORKSPACE' | 'USER';
  configured: boolean;
  enabled: boolean;
  /** `configured && enabled && phân hệ bật` — chỉ hiện nút Kết nối khi `true`. */
  available: boolean;
  events: string[];
}

export interface WatchedResource {
  id: string;
  fullName: string;
}

/** Khớp `INTEGRATION_TARGET_SCOPE_TYPES` của BE: kênh TEXT hoặc nhóm chat GROUP (hội thoại 1-1 không nhận được). */
export type IntegrationTargetScopeType = 'CHANNEL' | 'CONVERSATION';

export interface IntegrationTarget {
  scopeType: IntegrationTargetScopeType;
  scopeId: string;
  /** `null` khi người xem không đọc được đích (kênh riêng tư) — hiện "Kênh riêng tư". */
  name: string | null;
  private: boolean;
}

/** Bản đầy đủ cho OWNER/ADMIN. */
export interface IntegrationView {
  id: string;
  workspaceId: string;
  provider: IntegrationProvider;
  providerKey: IntegrationProviderKey;
  externalName: string;
  scopes: string[];
  config: { repos: WatchedResource[]; events: string[] };
  supportedEvents: string[];
  target: IntegrationTarget;
  status: IntegrationStatus;
  statusReason: string | null;
  lastEventAt: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
}

/** Bản rút gọn cho MEMBER: tên nhà cung cấp + kênh đích. */
export interface IntegrationPublicView {
  id: string;
  provider: IntegrationProvider;
  providerKey: IntegrationProviderKey;
  externalName: string;
  target: IntegrationTarget;
}

export interface WorkspaceIntegrations {
  canManage: boolean;
  items: (IntegrationView | IntegrationPublicView)[];
}

export interface UpdateIntegrationInput {
  repos?: WatchedResource[];
  events?: string[];
  targetScopeType?: IntegrationTargetScopeType;
  targetScopeId?: string;
  expectedVersion: number;
}

export interface ResourcePage {
  items: WatchedResource[];
  hasMore: boolean;
}

export interface IntegrationEvent {
  id: string;
  type: string;
  summary: string | null;
  status: WebhookEventStatus;
  error: string | null;
  receivedAt: string;
  processedAt: string | null;
  replayOf: string | null;
  hasMessage: boolean;
  replayable: boolean;
}

export interface EventsPage {
  items: IntegrationEvent[];
  nextCursor: string | null;
}

export interface UserIntegrationView {
  id: string;
  provider: IntegrationProvider;
  providerKey: IntegrationProviderKey;
  /** Email Google của chính người dùng. */
  accountLabel: string;
  calendarId: string;
  status: IntegrationStatus;
  statusReason: string | null;
  createdAt: string;
}

/** Kênh chọn làm nơi nhận (đọc thẳng `GET /workspaces/:id/channels`, KHÔNG dùng kiểu của `features/channels`). */
export interface TargetChannelOption {
  id: string;
  name: string;
  type: string;
  visibility: 'PUBLIC' | 'PRIVATE';
}

/**
 * Nhóm chat (GROUP) của nhóm làm việc chọn làm nơi nhận — đọc thẳng `GET /conversations?filter=group&workspaceId=` (mục
 * `ConversationListItem` của BE, chỉ lấy vài trường; KHÔNG dùng kiểu của `features/conversations`). Nhóm chat luôn "riêng tư".
 */
export interface TargetGroupChatOption {
  id: string;
  title: string | null;
  status: 'ACTIVE' | 'ARCHIVED' | 'DISSOLVED';
  /** BE đánh dấu người xem không gửi được (giải tán/lưu trữ/mất quyền) — BE sẽ từ chối `INT_005`, nên không cho chọn. */
  readOnly: boolean;
}
