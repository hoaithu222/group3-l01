import { createHash } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { INTEGRATION_PROVIDER_LABELS, type IntegrationProviderValue } from "../../../core/constants/integration";
import { ValidationError } from "../../../core/exceptions";
import { logger } from "../../../infrastructure/logger";
import type { ProviderWebhookHandler, ProviderWebhookResult } from "../../webhooks/provider-webhook.registry";
import type { IntegrationEntity } from "../entities/integration.interface";
import { intErrors } from "../integrations.errors";
import type { ParsedWebhook } from "../providers/provider.interface";
import type { EventProvider } from "../repositories/integration-event.repository.interface";
import type { IntegrationDeps } from "./integration.deps";
import { webhookProcessOutbox } from "./integration-jobs";

const WEBHOOK_PROVIDER: Record<IntegrationProviderValue, EventProvider | null> = {
  GITHUB: "GITHUB",
  GITLAB: "GITLAB",
  FIGMA: "FIGMA",
  GOOGLE_CALENDAR: null,
};

type Deps = Pick<IntegrationDeps, "registry" | "availability" | "integrations" | "events" | "status">;

function follows(integration: IntegrationEntity, parsed: ParsedWebhook): boolean {
  if (!parsed.resourceId) return false;
  const name = parsed.resourceName?.toLowerCase();
  return integration.config.repos.some((r) => r.id === parsed.resourceId || (name !== undefined && r.fullName.toLowerCase() === name));
}

/**
 * Nhận webhook của MỘT nhà cung cấp (`POST /webhooks/:provider`, đăng ký vào registry `webhooks` của p0-08): xác thực chữ ký/secret trên RAW body bằng so sánh
 * hằng thời gian → tìm kết nối → ghi `WebhookEvent` (unique `(provider, eventId)`) CÙNG transaction với dòng outbox `integrations.webhook-process` → 202.
 *
 * - Chữ ký sai/thiếu → 401 `INT_007`, KHÔNG tạo `WebhookEvent` (CW-01). Lỗi ghi DB → ném (5xx — nhà cung cấp gửi lại).
 * - Cùng delivery id gửi lại → không xử lý lại, vẫn 202 (CW-02).
 * - Nhà cung cấp bị admin tắt → ghi `IGNORED` (INT-09), kết nối không ACTIVE/loại sự kiện không theo dõi → `IGNORED` có lý do.
 * - KHÔNG ghi log cho sự kiện không khớp kết nối nào hoặc repo/tài nguyên KHÔNG được theo dõi: một GitHub App phục vụ mọi tổ chức nên phần lớn giao hàng là "của người
 *   khác" — ghi hết sẽ phình bảng log vô ích (lệch nhẹ so với be.md §5 "không có → IGNORED", có chủ đích).
 */
export class WebhookDispatcherService implements ProviderWebhookHandler {
  constructor(
    private readonly d: Deps,
    private readonly provider: IntegrationProviderValue
  ) {}

  async receive(req: { rawBody: Buffer; headers: IncomingHttpHeaders }): Promise<ProviderWebhookResult> {
    const adapter = this.d.registry.get(this.provider);
    const eventProvider = WEBHOOK_PROVIDER[this.provider];
    // Chưa cấu hình khoá ⇒ KHÔNG THỂ xác thực ⇒ không bao giờ chấp nhận (không phân biệt với chữ ký sai).
    if (!adapter?.isConfigured() || !adapter.verifyWebhook || !adapter.parseWebhook || !eventProvider) throw intErrors.badSignature();

    const verification = await adapter.verifyWebhook(req.rawBody, req.headers, {
      findBySecretHash: async (hash) => {
        const found = await this.d.integrations.findByWebhookSecretHash(hash);
        return found?.webhookSecretHash ? { id: found.id, webhookSecretHash: found.webhookSecretHash } : null;
      },
    });
    if (!verification.ok) throw intErrors.badSignature();

    const parsed = adapter.parseWebhook(req.rawBody, req.headers);
    if (!parsed) throw new ValidationError("Nội dung webhook không hợp lệ");

    const integration = await this.resolveIntegration(parsed, verification.integrationId);
    if (!integration) return { duplicate: false, status: "IGNORED" };

    if (parsed.lifecycle) return this.recordLifecycle(eventProvider, integration, parsed, req.rawBody);
    if (!follows(integration, parsed)) return { duplicate: false, status: "IGNORED" };

    let status: "RECEIVED" | "IGNORED" = "RECEIVED";
    let summary: string | null = null;
    if (!(await this.d.availability.isEnabled(this.provider))) {
      status = "IGNORED";
      summary = `${INTEGRATION_PROVIDER_LABELS[this.provider]} đang bị quản trị viên tắt`;
    } else if (integration.status !== "ACTIVE") {
      status = "IGNORED";
      summary = "Kết nối không hoạt động";
    } else if (!integration.config.events.includes(parsed.eventType)) {
      status = "IGNORED";
      summary = `Loại sự kiện "${parsed.eventType}" không được theo dõi`;
    }
    return this.ingest(eventProvider, integration, parsed, req.rawBody, status, summary);
  }

  private async resolveIntegration(parsed: ParsedWebhook, verifiedId?: string): Promise<IntegrationEntity | null> {
    if (verifiedId) return this.d.integrations.findById(verifiedId);
    if (!parsed.externalAccountId) return null;
    const rows = await this.d.integrations.findByExternal(this.provider, parsed.externalAccountId);
    return rows.find((r) => r.status === "ACTIVE") ?? rows[0] ?? null;
  }

  /** Sự kiện vòng đời cài đặt (GitHub `installation`): đổi trạng thái kết nối, ghi nhận `IGNORED` (không đăng tin). */
  private async recordLifecycle(provider: EventProvider, integration: IntegrationEntity, parsed: ParsedWebhook, rawBody: Buffer): Promise<ProviderWebhookResult> {
    let summary: string;
    if (parsed.lifecycle === "REVOKED") {
      await this.d.status.markRevoked(integration, "PROVIDER_REVOKED");
      summary = `Ứng dụng đã bị gỡ khỏi tài khoản ${integration.externalName}`;
    } else if (parsed.lifecycle === "SUSPENDED") {
      await this.d.status.markError(integration, "PROVIDER_SUSPENDED");
      summary = "Cài đặt bị tạm ngưng ở nhà cung cấp";
    } else {
      if (integration.status === "ERROR" && integration.statusReason === "PROVIDER_SUSPENDED") await this.d.status.markActive(integration);
      summary = "Cài đặt được mở lại ở nhà cung cấp";
    }
    return this.ingest(provider, integration, parsed, rawBody, "IGNORED", summary);
  }

  private async ingest(
    provider: EventProvider,
    integration: IntegrationEntity,
    parsed: ParsedWebhook,
    rawBody: Buffer,
    status: "RECEIVED" | "IGNORED",
    summary: string | null
  ): Promise<ProviderWebhookResult> {
    const { created } = await this.d.events.ingest({
      provider,
      eventId: parsed.eventId,
      type: parsed.eventType,
      payloadHash: createHash("sha256").update(rawBody).digest("hex"),
      payload: parsed.payload,
      integrationId: integration.id,
      summary,
      status,
      outbox: status === "RECEIVED" ? (rowId) => webhookProcessOutbox(provider, parsed.eventId, rowId) : undefined,
    });
    if (!created) logger.debug("[integrations] Webhook gửi lặp — bỏ qua", { provider, eventId: parsed.eventId });
    return { duplicate: !created, status: status === "RECEIVED" ? "ACCEPTED" : "IGNORED" };
  }
}
