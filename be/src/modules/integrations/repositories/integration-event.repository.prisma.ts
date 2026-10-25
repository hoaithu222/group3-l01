import { Prisma, type WebhookEvent, type WebhookProvider } from "@prisma/client";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { isUniqueViolation, PrismaWebhookEventRepository, type IWebhookEventRepository } from "../../webhooks/webhook-event.repo";
import type { IntegrationEventEntity, WebhookEventStatusValue } from "../entities/integration.interface";
import type {
  EventCursorPage,
  EventFinishPatch,
  EventListFilter,
  IIntegrationEventRepository,
  IngestEventInput,
} from "./integration-event.repository.interface";

/** Các nhà cung cấp webhook của tích hợp (LiveKit thuộc p0-08 — KHÔNG lẫn vào log tích hợp). */
export const INTEGRATION_WEBHOOK_PROVIDERS: WebhookProvider[] = ["GITHUB", "GITLAB", "GOOGLE", "FIGMA"];

export function toEventEntity(row: WebhookEvent): IntegrationEventEntity {
  return {
    id: row.id,
    provider: row.provider as IntegrationEventEntity["provider"],
    eventId: row.eventId,
    type: row.type,
    status: row.status,
    error: row.error,
    attempts: row.attempts,
    receivedAt: row.receivedAt,
    processedAt: row.processedAt,
    integrationId: row.integrationId ?? null,
    summary: row.summary ?? null,
    messageId: row.messageId ?? null,
    replayOf: row.replayOf ?? null,
    payload: row.payload,
  };
}

function whereOf(filter: EventListFilter): Prisma.WebhookEventWhereInput {
  return {
    provider: filter.provider ?? { in: INTEGRATION_WEBHOOK_PROVIDERS },
    ...(filter.status && { status: filter.status }),
    ...(filter.integrationIds && { integrationId: { in: filter.integrationIds } }),
    ...((filter.from || filter.to) && { receivedAt: { ...(filter.from && { gte: filter.from }), ...(filter.to && { lte: filter.to }) } }),
  };
}

/**
 * Log sự kiện tích hợp trên bảng `WebhookEvent` (p0-08): ghi dòng log dùng lại `PrismaWebhookEventRepository.create(input, tx)` (p5-03 mở rộng), cùng
 * transaction với dòng outbox `integrations.webhook-process`. Trùng `(provider, eventId)` → P2002 → bắt NGOÀI transaction.
 */
export class PrismaIntegrationEventRepository implements IIntegrationEventRepository {
  constructor(private readonly base: IWebhookEventRepository = new PrismaWebhookEventRepository()) {}

  async ingest(input: IngestEventInput): Promise<{ created: boolean; record: IntegrationEventEntity | null }> {
    try {
      const row = await withTransaction(async (tx) => {
        const created = await this.base.create(
          { provider: input.provider, eventId: input.eventId, type: input.type, roomName: null, payloadHash: input.payloadHash, payload: input.payload, integrationId: input.integrationId, summary: input.summary, replayOf: input.replayOf ?? null },
          tx
        );
        if (!created) throw new Error("[integrations] WebhookEvent.create không trả bản ghi trong transaction");
        if (input.status === "IGNORED") {
          return tx.webhookEvent.update({ where: { id: created.id }, data: { status: "IGNORED", processedAt: new Date() } });
        }
        if (input.outbox) await outbox.add(tx, input.outbox(created.id));
        return tx.webhookEvent.findUniqueOrThrow({ where: { id: created.id } });
      });
      return { created: true, record: toEventEntity(row) };
    } catch (err) {
      if (isUniqueViolation(err)) return { created: false, record: null };
      throw err;
    }
  }

  async findById(id: string): Promise<IntegrationEventEntity | null> {
    const row = await prisma.webhookEvent.findUnique({ where: { id } });
    return row ? toEventEntity(row) : null;
  }

  beginAttempt(id: string): Promise<void> {
    return this.base.beginAttempt(id);
  }

  async finish(id: string, status: Extract<WebhookEventStatusValue, "PROCESSED" | "IGNORED" | "FAILED">, patch: EventFinishPatch, at: Date): Promise<void> {
    await prisma.webhookEvent.update({
      where: { id },
      data: {
        status,
        processedAt: status === "FAILED" ? null : at,
        error: status === "FAILED" ? (patch.error ?? "Lỗi không xác định") : null,
        ...(patch.summary !== undefined && { summary: patch.summary }),
        ...(patch.messageId !== undefined && { messageId: patch.messageId }),
      },
    });
  }

  async listByIntegration(integrationId: string, opts: { cursor?: string; limit: number; status?: WebhookEventStatusValue }): Promise<EventCursorPage> {
    const point = opts.cursor ? decodeCursor(opts.cursor) : null;
    const rows = await prisma.webhookEvent.findMany({
      where: {
        integrationId,
        ...(opts.status && { status: opts.status }),
        ...(point && { OR: [{ receivedAt: { lt: point.at } }, { receivedAt: point.at, id: { lt: point.id } }] }),
      },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: opts.limit + 1,
    });
    const page = rows.slice(0, opts.limit);
    const last = page[page.length - 1];
    return { items: page.map(toEventEntity), nextCursor: rows.length > opts.limit && last ? encodeCursor(last.receivedAt, last.id) : null };
  }

  async listAdmin(filter: EventListFilter, page: number, limit: number): Promise<{ items: IntegrationEventEntity[]; total: number }> {
    const where = whereOf(filter);
    const [rows, total] = await Promise.all([
      prisma.webhookEvent.findMany({ where, orderBy: [{ receivedAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
      prisma.webhookEvent.count({ where }),
    ]);
    return { items: rows.map(toEventEntity), total };
  }

  countReplays(originalId: string): Promise<number> {
    return prisma.webhookEvent.count({ where: { replayOf: originalId } });
  }

  async listReplays(originalId: string, limit: number): Promise<IntegrationEventEntity[]> {
    const rows = await prisma.webhookEvent.findMany({ where: { replayOf: originalId }, orderBy: { receivedAt: "desc" }, take: limit });
    return rows.map(toEventEntity);
  }

  async countByProviderSince(since: Date): Promise<Record<string, number>> {
    const rows = await prisma.webhookEvent.groupBy({
      by: ["provider"],
      where: { provider: { in: INTEGRATION_WEBHOOK_PROVIDERS }, receivedAt: { gte: since } },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.provider, r._count._all]));
  }

  async latestErrors(): Promise<Record<string, { error: string; at: Date } | undefined>> {
    const out: Record<string, { error: string; at: Date } | undefined> = {};
    await Promise.all(
      INTEGRATION_WEBHOOK_PROVIDERS.map(async (provider) => {
        const row = await prisma.webhookEvent.findFirst({ where: { provider, status: "FAILED" }, orderBy: { receivedAt: "desc" }, select: { error: true, receivedAt: true } });
        if (row?.error) out[provider] = { error: row.error, at: row.receivedAt };
      })
    );
    return out;
  }

  async clearPayloadBefore(before: Date): Promise<number> {
    const res = await prisma.webhookEvent.updateMany({
      where: { provider: { in: INTEGRATION_WEBHOOK_PROVIDERS }, receivedAt: { lt: before } },
      data: { payload: null },
    });
    return res.count;
  }

  async deleteBefore(before: Date): Promise<number> {
    const res = await prisma.webhookEvent.deleteMany({ where: { provider: { in: INTEGRATION_WEBHOOK_PROVIDERS }, receivedAt: { lt: before } } });
    return res.count;
  }
}
