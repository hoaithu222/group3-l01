import type { SealedSecret } from "../../../core/utils/crypto";
import type { IntegrationProviderValue, IntegrationTargetScopeType } from "../../../core/constants/integration";
import type { IntegrationConfig, IntegrationEntity, IntegrationStatusValue } from "../entities/integration.interface";
import type { OutboxEventInput } from "../../../infrastructure/queue";

export interface UpsertIntegrationInput {
  workspaceId: string;
  provider: IntegrationProviderValue;
  externalAccountId: string;
  externalName: string;
  credentials: SealedSecret | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
  /** Chỉ dùng khi TẠO MỚI (kết nối lại giữ cấu hình + đích cũ). */
  config: IntegrationConfig;
  targetScopeType: IntegrationTargetScopeType;
  targetScopeId: string;
  webhookSecretHash: string | null;
  createdBy: string;
  /** Ghi cùng transaction (vd hẹn làm mới token) — chỉ khi kết nối có token hết hạn. */
  outbox?: (integrationId: string) => OutboxEventInput[];
}

export interface IntegrationPatch {
  config?: IntegrationConfig;
  /** Người chịu trách nhiệm về đích (quyền GHI của họ được kiểm lại mỗi lần đăng tin) — đổi đích thì đặt là người vừa xác nhận đích. */
  createdBy?: string;
  targetScopeType?: IntegrationTargetScopeType;
  targetScopeId?: string;
  externalHookIds?: string[];
  webhookSecretHash?: string | null;
  status?: IntegrationStatusValue;
  statusReason?: string | null;
}

export interface AdminIntegrationFilter {
  status?: IntegrationStatusValue[];
  provider?: IntegrationProviderValue;
  workspaceId?: string;
  page: number;
  limit: number;
}

export interface ProviderStatRow {
  provider: IntegrationProviderValue;
  status: IntegrationStatusValue;
  count: number;
}

/** Truy cập `Integration` (kết nối cấp workspace). Ghi trạng thái/cấu hình luôn tăng `version` (CAS khi có `expectedVersion`). */
export interface IIntegrationRepository {
  findById(id: string): Promise<IntegrationEntity | null>;
  listByWorkspace(workspaceId: string): Promise<IntegrationEntity[]>;
  countByWorkspace(workspaceId: string): Promise<number>;
  /** Mọi kết nối của một tài khoản ngoài (mọi workspace) — tra kết nối khi nhận webhook + kiểm `INT_008`. */
  findByExternal(provider: IntegrationProviderValue, externalAccountId: string): Promise<IntegrationEntity[]>;
  findByWebhookSecretHash(hash: string): Promise<IntegrationEntity | null>;
  /** Tạo mới hoặc kết nối lại (khoá `(workspaceId, provider, externalAccountId)`): kết nối lại đặt `ACTIVE`, xoá lý do, thay token, giữ cấu hình/đích. */
  upsert(input: UpsertIntegrationInput): Promise<{ entity: IntegrationEntity; created: boolean }>;
  /** `null` khi `version` lệch hoặc không còn (caller phân biệt bằng `findById`). */
  updateWithVersion(id: string, expectedVersion: number, patch: IntegrationPatch): Promise<IntegrationEntity | null>;
  /** Không CAS (job/listener) — trả bản mới; `null` khi không còn. */
  patch(id: string, patch: IntegrationPatch): Promise<IntegrationEntity | null>;
  saveCredentials(id: string, credentials: SealedSecret | null, tokenExpiresAt: Date | null): Promise<void>;
  touchLastEvent(id: string, at: Date): Promise<void>;
  /** Đánh dấu vừa được kiểm tra (đẩy `updatedAt`, KHÔNG đổi `version`) — cron sức khoẻ không kiểm lại cùng một kết nối mỗi giờ. */
  touchUpdated(id: string, at: Date): Promise<void>;
  delete(id: string): Promise<void>;
  /** Kết nối ACTIVE đang nhận tin vào một đích (kiểm lại quyền khi có thu hồi). */
  listActiveByTarget(scopeType: IntegrationTargetScopeType, scopeId: string): Promise<IntegrationEntity[]>;
  /** Kết nối ACTIVE của workspace (`workspaceId`) do một trong `userIds` tạo. */
  listActiveByCreators(workspaceId: string, userIds: string[]): Promise<IntegrationEntity[]>;
  listAdmin(filter: AdminIntegrationFilter): Promise<{ items: IntegrationEntity[]; total: number }>;
  providerStats(): Promise<ProviderStatRow[]>;
  /** ACTIVE không có sự kiện từ `before` (cron giờ kiểm sức khoẻ). */
  listIdle(before: Date, limit: number): Promise<IntegrationEntity[]>;
}
