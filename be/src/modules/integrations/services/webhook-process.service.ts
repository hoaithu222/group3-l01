import { INTEGRATION_PROVIDER_LABELS } from "../../../core/constants/integration";
import { logger } from "../../../infrastructure/logger";
import type { ISystemMessagePort } from "../../messages/public";
import type { IntegrationEntity, IntegrationEventEntity } from "../entities/integration.interface";
import type { IntegrationDeps } from "./integration.deps";

export type ProcessOutcome = "PROCESSED" | "IGNORED" | "FAILED" | "SKIPPED";

const ERROR_MAX_CHARS = 300;
const PROVIDER_OF_EVENT: Record<IntegrationEventEntity["provider"], IntegrationEntity["provider"]> = {
  GITHUB: "GITHUB",
  GITLAB: "GITLAB",
  FIGMA: "FIGMA",
  GOOGLE: "GOOGLE_CALENDAR",
};

type Deps = Pick<IntegrationDeps, "registry" | "availability" | "integrations" | "events" | "target" | "status" | "now">;

/**
 * Xử lý một `WebhookEvent` (job `integrations.webhook-process`, README §3/be.md §5): kiểm nhà cung cấp/kết nối/loại sự kiện → map payload → kiểm ĐÍCH (INT-06) →
 * `SystemMessageService.post` (dedupe `int:<webhookEventId>` nên retry không đăng trùng) → `PROCESSED` + `messageId`. Không thể đăng vì đích (lưu trữ/mất quyền) →
 * `FAILED` + kết nối `ERROR` + thông báo, KHÔNG đăng tin, KHÔNG thử lại. Lỗi tạm thời (đăng tin lỗi) → ghi `FAILED` rồi ném để BullMQ thử lại (≤ 5).
 */
export class WebhookProcessService {
  constructor(
    private readonly d: Deps,
    private readonly systemMessages: ISystemMessagePort
  ) {}

  async process(webhookEventId: string): Promise<ProcessOutcome> {
    const row = await this.d.events.findById(webhookEventId);
    if (!row) {
      logger.warn("[integrations] Không thấy WebhookEvent (đã bị dọn?)", { webhookEventId });
      return "SKIPPED";
    }
    if (row.status === "PROCESSED" || row.status === "IGNORED") return "SKIPPED";
    await this.d.events.beginAttempt(row.id);

    const integration = row.integrationId ? await this.d.integrations.findById(row.integrationId) : null;
    const provider = PROVIDER_OF_EVENT[row.provider];
    if (!integration) return this.ignore(row, "Kết nối không còn tồn tại");
    if (!(await this.d.availability.isEnabled(provider))) return this.ignore(row, `${INTEGRATION_PROVIDER_LABELS[provider]} đang bị quản trị viên tắt`);
    if (integration.status !== "ACTIVE") return this.ignore(row, "Kết nối không hoạt động");
    if (!integration.config.events.includes(row.type)) return this.ignore(row, `Loại sự kiện "${row.type}" không được theo dõi`);

    const adapter = this.d.registry.get(provider);
    const payload = typeof row.payload === "object" && row.payload !== null && !Array.isArray(row.payload) ? (row.payload as Record<string, unknown>) : null;
    if (!payload) return this.fail(row, "Payload đã bị xoá (quá thời gian lưu)");
    const message = adapter?.mapEvent?.(row.type, payload) ?? null;
    if (!message) return this.ignore(row, "Sự kiện hoặc hành động không được hỗ trợ");

    const postable = await this.d.target.checkPostable(integration);
    if (!postable.ok) {
      await this.d.status.markError(integration, postable.reason);
      return this.fail(row, postable.reason);
    }

    let messageId: string;
    try {
      const posted = await this.systemMessages.post({
        scopeType: integration.targetScopeType,
        scopeId: integration.targetScopeId,
        workspaceId: integration.workspaceId,
        systemType: "INTEGRATION",
        payload: { ...message, integrationId: integration.id },
        dedupeKey: `int:${row.id}`,
      });
      messageId = posted.id;
    } catch (err) {
      await this.d.events.finish(row.id, "FAILED", { error: (err instanceof Error ? err.message : String(err)).slice(0, ERROR_MAX_CHARS) }, this.d.now());
      throw err;
    }
    await this.d.events.finish(row.id, "PROCESSED", { summary: message.summary, messageId }, this.d.now());
    await this.d.integrations.touchLastEvent(integration.id, this.d.now());
    return "PROCESSED";
  }

  private async ignore(row: IntegrationEventEntity, summary: string): Promise<ProcessOutcome> {
    await this.d.events.finish(row.id, "IGNORED", { summary }, this.d.now());
    return "IGNORED";
  }

  private async fail(row: IntegrationEventEntity, error: string): Promise<ProcessOutcome> {
    await this.d.events.finish(row.id, "FAILED", { error }, this.d.now());
    return "FAILED";
  }
}
