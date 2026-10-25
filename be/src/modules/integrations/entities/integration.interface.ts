import type { SealedSecret } from "../../../core/utils/crypto";
import type {
  IntegrationProviderValue,
  IntegrationStatusReason,
  IntegrationTargetScopeType,
} from "../../../core/constants/integration";

export type IntegrationStatusValue = "ACTIVE" | "ERROR" | "REVOKED" | "DISABLED";
export type WebhookEventStatusValue = "RECEIVED" | "PROCESSED" | "FAILED" | "IGNORED";

/** Tài nguyên được theo dõi: repo GitHub, project GitLab hoặc file Figma (`id` là khoá của nhà cung cấp, `fullName` để hiển thị). */
export interface WatchedResource {
  id: string;
  fullName: string;
}

export interface IntegrationConfig {
  repos: WatchedResource[];
  events: string[];
}

export const EMPTY_INTEGRATION_CONFIG: IntegrationConfig = { repos: [], events: [] };

/**
 * Kết nối cấp workspace (`Integration`). `credentials` là bí mật đã mã hoá — KHÔNG bao giờ đưa vào DTO/log (xem `integration.presenter.ts`).
 */
export interface IntegrationEntity {
  id: string;
  workspaceId: string;
  provider: IntegrationProviderValue;
  externalAccountId: string;
  externalName: string;
  credentials: SealedSecret | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
  config: IntegrationConfig;
  targetScopeType: IntegrationTargetScopeType;
  targetScopeId: string;
  webhookSecretHash: string | null;
  externalHookIds: string[];
  status: IntegrationStatusValue;
  statusReason: string | null;
  createdBy: string;
  lastEventAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Kết nối cá nhân (Google Calendar). */
export interface UserIntegrationEntity {
  id: string;
  userId: string;
  provider: IntegrationProviderValue;
  externalAccountId: string;
  credentials: SealedSecret | null;
  tokenExpiresAt: Date | null;
  calendarId: string;
  status: IntegrationStatusValue;
  statusReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarLinkEntity {
  id: string;
  meetingId: string;
  userId: string;
  userIntegrationId: string;
  externalEventId: string;
  etag: string | null;
  syncedVersion: number;
  deletedAt: Date | null;
}

/** Dòng log sự kiện (bảng `WebhookEvent`, chỉ các trường tích hợp cần). `payload` chỉ để phát lại — không bao giờ trả cho app. */
export interface IntegrationEventEntity {
  id: string;
  provider: "GITHUB" | "GITLAB" | "GOOGLE" | "FIGMA";
  eventId: string;
  type: string;
  status: WebhookEventStatusValue;
  error: string | null;
  attempts: number;
  receivedAt: Date;
  processedAt: Date | null;
  integrationId: string | null;
  summary: string | null;
  messageId: string | null;
  replayOf: string | null;
  payload: unknown;
}

/**
 * Nội dung tin hệ thống `INTEGRATION` (`ISystemMessagePort`, payload validate bởi `systemPayloadSchemas.INTEGRATION`). `source`/`summary` là hai trường
 * cũ của p1-04 (giữ để tin cũ vẫn hợp lệ); phần còn lại app vẽ khối riêng (icon nhà cung cấp, tiêu đề, tối đa 5 commit, nút "Mở trên …").
 */
export interface IntegrationMessagePayload {
  /** Khoá nhà cung cấp chữ thường: `github` | `gitlab` | `figma`. */
  source: string;
  /** 1 dòng, đã cắt độ dài — dùng làm xem trước/tóm tắt log. */
  summary: string;
  provider: "GITHUB" | "GITLAB" | "FIGMA";
  event: string;
  action?: string;
  title: string;
  url?: string;
  actor?: { login: string; avatarUrl?: string };
  repo?: string;
  ref?: string;
  number?: number;
  commits?: Array<{ sha7: string; message: string }>;
  /** Tổng số commit của lần push (có thể lớn hơn `commits.length` vì chỉ hiện tối đa `commitsInMessageMax`). */
  commitCount?: number;
  integrationId?: string;
}

/** Lý do trạng thái đã biết (đầu vào có kiểm); chuỗi khác vẫn lưu được nhưng app hiện nhãn chung. */
export type StatusReason = IntegrationStatusReason;
