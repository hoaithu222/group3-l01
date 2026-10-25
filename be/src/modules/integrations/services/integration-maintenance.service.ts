import { LIMITS } from "../../../core/constants/limits";
import { logger } from "../../../infrastructure/logger";
import type { IntegrationEntity } from "../entities/integration.interface";
import { ProviderAuthError } from "../providers/provider.interface";
import type { IntegrationDeps } from "./integration.deps";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Việc nền định kỳ/phản ứng của module tích hợp: (1) kiểm lại ĐÍCH khi có thu hồi quyền (INT-06: người cấu hình mất grant kênh riêng tư → kết nối `ERROR`,
 * thông báo, ngừng đăng tin); (2) cron giờ kiểm sức khoẻ kết nối ACTIVE lâu không có sự kiện; (3) cron 03:00 dọn log (payload > 30 ngày không còn phát lại được,
 * dòng log > 90 ngày bị xoá).
 */
export class IntegrationMaintenanceService {
  constructor(private readonly d: IntegrationDeps) {}

  /** Job `integrations.target-recheck` — sau `revokeScope` của WORKSPACE/CHANNEL/CONVERSATION. Idempotent (chỉ đổi kết nối đang ACTIVE). Trả số kết nối bị chuyển ERROR. */
  async recheckTargets(input: { scopeType: string; scopeId: string; userIds: string[] }): Promise<number> {
    let candidates: IntegrationEntity[] = [];
    if (input.scopeType === "WORKSPACE") candidates = await this.d.integrations.listActiveByCreators(input.scopeId, input.userIds);
    else if (input.scopeType === "CHANNEL" || input.scopeType === "CONVERSATION") {
      candidates = (await this.d.integrations.listActiveByTarget(input.scopeType, input.scopeId)).filter((i) => input.userIds.includes(i.createdBy));
    }
    let changed = 0;
    for (const integration of candidates) {
      const check = await this.d.target.checkPostable(integration);
      if (check.ok) continue;
      await this.d.status.markError(integration, check.reason);
      changed += 1;
    }
    return changed;
  }

  /** Cron giờ: kết nối ACTIVE không có sự kiện `healthCheckIdleDays` ngày → kiểm cài đặt/hook còn tồn tại. Lỗi mạng bỏ qua (lượt sau kiểm lại). */
  async healthCheck(): Promise<{ checked: number; changed: number }> {
    const before = new Date(this.d.now().getTime() - LIMITS.integration.healthCheckIdleDays * DAY_MS);
    const idle = await this.d.integrations.listIdle(before, LIMITS.integration.healthCheckBatch);
    let changed = 0;
    for (const integration of idle) {
      const adapter = this.d.registry.get(integration.provider);
      if (!adapter?.checkHealth) {
        await this.d.integrations.touchUpdated(integration.id, this.d.now());
        continue;
      }
      try {
        const result = await adapter.checkHealth(await this.d.tokens.workspaceContext(integration));
        if (result === "REVOKED") {
          await this.d.status.markRevoked(integration, "PROVIDER_REVOKED");
          changed += 1;
        } else if (result === "HOOK_MISSING") {
          await this.d.status.markError(integration, "HOOK_MISSING");
          changed += 1;
        }
        await this.d.integrations.touchUpdated(integration.id, this.d.now());
      } catch (err) {
        if (err instanceof ProviderAuthError) {
          await this.d.status.markRevoked(integration, "TOKEN_INVALID");
          changed += 1;
        } else {
          logger.warn("[integrations.health-check] Không kiểm được kết nối (bỏ qua)", { integrationId: integration.id, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    return { checked: idle.length, changed };
  }

  /** Cron 03:00: xoá payload quá `eventsLogRetentionDays` (phát lại → `INT_006`) và dòng log quá `eventsRowRetentionDays`. */
  async pruneEvents(): Promise<{ cleared: number; deleted: number }> {
    const now = this.d.now().getTime();
    const cleared = await this.d.events.clearPayloadBefore(new Date(now - LIMITS.integration.eventsLogRetentionDays * DAY_MS));
    const deleted = await this.d.events.deleteBefore(new Date(now - LIMITS.integration.eventsRowRetentionDays * DAY_MS));
    return { cleared, deleted };
  }
}
