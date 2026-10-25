import { createHash } from "node:crypto";
import { LIMITS } from "../../../core/constants/limits";
import { NotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { IntegrationEventEntity } from "../entities/integration.interface";
import type { EventsQueryDto } from "../dtos/integration.dto";
import { intErrors } from "../integrations.errors";
import { IntegrationGuard } from "./integration-guard";
import type { IntegrationDeps } from "./integration.deps";
import { webhookProcessOutbox } from "./integration-jobs";

const DAY_MS = 24 * 60 * 60 * 1000;
const REPLAY_RETRIES = 3;

/** Dòng log sự kiện trả cho app — KHÔNG có `payload` (chỉ phát lại/xem ở admin đã che). */
export interface IntegrationEventView {
  id: string;
  type: string;
  summary: string | null;
  status: string;
  error: string | null;
  receivedAt: string;
  processedAt: string | null;
  replayOf: string | null;
  hasMessage: boolean;
  /** Còn payload trong thời gian lưu → phát lại được. */
  replayable: boolean;
}

export function presentEvent(e: IntegrationEventEntity, now: Date): IntegrationEventView {
  const cutoff = now.getTime() - LIMITS.integration.eventsLogRetentionDays * DAY_MS;
  return {
    id: e.id,
    type: e.type,
    summary: e.summary,
    status: e.status,
    error: e.error,
    receivedAt: e.receivedAt.toISOString(),
    processedAt: e.processedAt ? e.processedAt.toISOString() : null,
    replayOf: e.replayOf,
    hasMessage: e.messageId !== null,
    replayable: e.payload !== null && e.receivedAt.getTime() >= cutoff,
  };
}

/**
 * Log sự kiện + PHÁT LẠI (README §5): phát lại tạo `WebhookEvent` MỚI (`replayOf`, `eventId = <gốc>:replay:<n>`) và xếp lại job — tin hệ thống dedupe theo id
 * dòng log mới nên CỐ Ý tạo tin mới. Quá thời gian lưu payload → `INT_006` (410). Hạn mức `replayPerHour` do route (`scopeLimiter`) áp.
 */
export class IntegrationEventsService {
  private readonly guard: IntegrationGuard;

  constructor(private readonly d: IntegrationDeps) {
    this.guard = new IntegrationGuard(d);
  }

  async list(actor: AuthUser, integrationId: string, q: EventsQueryDto): Promise<{ items: IntegrationEventView[]; nextCursor: string | null; limit: number }> {
    await this.guard.requireAdmin(actor, integrationId);
    const page = await this.d.events.listByIntegration(integrationId, { cursor: q.cursor, limit: q.limit, status: q.status });
    const now = this.d.now();
    return { items: page.items.map((e) => presentEvent(e, now)), nextCursor: page.nextCursor, limit: q.limit };
  }

  /** Phát lại bởi OWNER/ADMIN nhóm (`POST /integrations/:id/events/:eventId/replay`). */
  async replay(actor: AuthUser, integrationId: string, eventId: string): Promise<IntegrationEventView> {
    const integration = await this.guard.requireAdmin(actor, integrationId);
    const event = await this.d.events.findById(eventId);
    if (!event || event.integrationId !== integration.id) throw new NotFoundError();
    const created = await this.createReplay(event);
    await this.d.audit.record({ actorId: actor.id, action: "integration.replay", targetType: "Integration", targetId: integration.id, workspaceId: integration.workspaceId, metadata: { eventId: event.id } });
    return presentEvent(created, this.d.now());
  }

  /** Tạo bản phát lại (dùng chung workspace-admin và admin nền tảng). */
  async createReplay(event: IntegrationEventEntity): Promise<IntegrationEventEntity> {
    const cutoff = this.d.now().getTime() - LIMITS.integration.eventsLogRetentionDays * DAY_MS;
    if (event.payload === null || typeof event.payload !== "object" || !event.integrationId || event.receivedAt.getTime() < cutoff) throw intErrors.eventExpired();
    const rootId = event.replayOf ?? event.id;
    const baseEventId = event.eventId.split(":replay:")[0] as string;
    const payload = event.payload as Record<string, unknown>;
    const start = (await this.d.events.countReplays(rootId)) + 1;
    for (let i = 0; i < REPLAY_RETRIES; i += 1) {
      const eventId = `${baseEventId}:replay:${start + i}`;
      const { created, record } = await this.d.events.ingest({
        provider: event.provider,
        eventId,
        type: event.type,
        payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
        payload,
        integrationId: event.integrationId,
        summary: event.summary ? `Phát lại: ${event.summary}`.slice(0, 300) : "Phát lại",
        replayOf: rootId,
        status: "RECEIVED",
        outbox: (rowId) => webhookProcessOutbox(event.provider, eventId, rowId),
      });
      if (created && record) return record;
    }
    // Ba số liên tiếp đều bị chiếm (nhiều người bấm cùng lúc): coi như đang có bản phát lại chạy — báo xung đột nhẹ nhàng.
    throw intErrors.unsupportedEvent({ reason: "REPLAY_IN_PROGRESS" });
  }
}
