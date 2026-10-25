import { logger } from "../../../infrastructure/logger";
import type { IntegrationEntity, UserIntegrationEntity } from "../entities/integration.interface";
import type { IIntegrationRepository } from "../repositories/integration.repository.interface";
import type { IUserIntegrationRepository } from "../repositories/user-integration.repository.interface";
import type { IIntegrationDirectory, IIntegrationEmitter, IIntegrationNotifier } from "./integration.ports";

export interface StatusDeps {
  integrations: IIntegrationRepository;
  userIntegrations: IUserIntegrationRepository;
  directory: IIntegrationDirectory;
  notifier: IIntegrationNotifier;
  emitter: IIntegrationEmitter;
  now?: () => Date;
}

/**
 * Mọi chuyển trạng thái kết nối (ERROR/REVOKED/ACTIVE) đi qua đây để luôn kèm thông báo + realtime (README §5):
 * `INTEGRATION_ERROR` tới người kết nối + OWNER (chỉ khi CHUYỂN từ ACTIVE — không lặp mỗi sự kiện) và `integration:updated` tới OWNER/ADMIN nhóm.
 * Thông báo/realtime lỗi chỉ log, không làm hỏng luồng gọi (job/webhook).
 */
export class IntegrationStatusService {
  private readonly now: () => Date;

  constructor(private readonly d: StatusDeps) {
    this.now = d.now ?? (() => new Date());
  }

  /** `ACTIVE` → `ERROR` (đã ERROR/REVOKED thì giữ nguyên, không thông báo lại). Trả bản ghi mới nhất. */
  async markError(integration: IntegrationEntity, reason: string): Promise<IntegrationEntity> {
    if (integration.status !== "ACTIVE") return integration;
    const next = await this.d.integrations.patch(integration.id, { status: "ERROR", statusReason: reason });
    if (!next) return integration;
    await this.afterChange(next, reason, true);
    return next;
  }

  /** → `REVOKED` (token bị thu hồi/cài đặt bị gỡ): xoá token đã lưu, thông báo một lần khi vừa chuyển. */
  async markRevoked(integration: IntegrationEntity, reason: string): Promise<IntegrationEntity> {
    if (integration.status === "REVOKED") return integration;
    const wasActive = integration.status === "ACTIVE";
    const next = await this.d.integrations.patch(integration.id, { status: "REVOKED", statusReason: reason });
    if (!next) return integration;
    await this.d.integrations.saveCredentials(integration.id, null, null);
    await this.afterChange(next, reason, wasActive);
    return next;
  }

  /** `ERROR`/`DISABLED` → `ACTIVE` (đích đã sửa, hoặc cài đặt được mở lại). */
  async markActive(integration: IntegrationEntity): Promise<IntegrationEntity> {
    if (integration.status === "ACTIVE") return integration;
    const next = await this.d.integrations.patch(integration.id, { status: "ACTIVE", statusReason: null });
    if (!next) return integration;
    await this.afterChange(next, null, false);
    return next;
  }

  /** Google Calendar cá nhân bị thu hồi (`invalid_grant`): `REVOKED` + xoá token + thông báo người dùng. */
  async markUserRevoked(entity: UserIntegrationEntity, reason: string): Promise<void> {
    if (entity.status === "REVOKED") return;
    await this.d.userIntegrations.setStatus(entity.id, "REVOKED", reason, true);
    await this.notify({ subjectId: entity.id, workspaceId: null, provider: entity.provider, reason, at: this.now(), recipientIds: [entity.userId] });
  }

  /** Phát `integration:updated` (đổi cấu hình/trạng thái) — không thông báo. */
  async emitUpdated(integration: IntegrationEntity): Promise<void> {
    try {
      const admins = await this.d.directory.listMemberIdsByRole(integration.workspaceId, ["OWNER", "ADMIN"]);
      this.d.emitter.integrationUpdated(admins, {
        integrationId: integration.id,
        workspaceId: integration.workspaceId,
        status: integration.status,
        statusReason: integration.statusReason,
        lastEventAt: integration.lastEventAt ? integration.lastEventAt.toISOString() : null,
        version: integration.version,
      });
    } catch (err) {
      logger.warn("[integrations] Không phát được integration:updated", { integrationId: integration.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async afterChange(integration: IntegrationEntity, reason: string | null, notify: boolean): Promise<void> {
    if (notify && reason) {
      try {
        const owners = await this.d.directory.listMemberIdsByRole(integration.workspaceId, ["OWNER"]);
        await this.notify({
          subjectId: integration.id,
          workspaceId: integration.workspaceId,
          provider: integration.provider,
          reason,
          at: this.now(),
          recipientIds: [...new Set([integration.createdBy, ...owners])],
        });
      } catch (err) {
        logger.warn("[integrations] Không gửi được INTEGRATION_ERROR", { integrationId: integration.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    await this.emitUpdated(integration);
  }

  private async notify(notice: Parameters<IIntegrationNotifier["integrationError"]>[0]): Promise<void> {
    try {
      await this.d.notifier.integrationError(notice);
    } catch (err) {
      logger.warn("[integrations] Không gửi được INTEGRATION_ERROR", { subjectId: notice.subjectId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
