import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import type { OutboxEventInput } from "../../../infrastructure/queue";
import type { IntegrationEventEntity, WebhookEventStatusValue } from "../entities/integration.interface";
import type {
  EventCursorPage,
  EventFinishPatch,
  EventListFilter,
  IIntegrationEventRepository,
  IngestEventInput,
} from "./integration-event.repository.interface";

/** Repository in-memory cho unit test: mô phỏng unique `(provider, eventId)` và dòng outbox đi cùng dòng log. */
export class InMemoryIntegrationEventRepository implements IIntegrationEventRepository {
  readonly rows = new Map<string, IntegrationEventEntity>();
  readonly outboxRows: OutboxEventInput[] = [];
  /** Đặt để mô phỏng DB lỗi khi ghi (webhook phải trả 5xx để nhà cung cấp gửi lại). */
  failIngestWith: Error | null = null;
  private seq = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  ingest(input: IngestEventInput): Promise<{ created: boolean; record: IntegrationEventEntity | null }> {
    if (this.failIngestWith) return Promise.reject(this.failIngestWith);
    if ([...this.rows.values()].some((r) => r.provider === input.provider && r.eventId === input.eventId)) return Promise.resolve({ created: false, record: null });
    const at = this.now();
    const row: IntegrationEventEntity = {
      id: `ev_${++this.seq}`,
      provider: input.provider,
      eventId: input.eventId,
      type: input.type,
      status: input.status,
      error: null,
      attempts: 0,
      receivedAt: at,
      processedAt: input.status === "IGNORED" ? at : null,
      integrationId: input.integrationId,
      summary: input.summary,
      messageId: null,
      replayOf: input.replayOf ?? null,
      payload: input.payload,
    };
    this.rows.set(row.id, row);
    if (input.status === "RECEIVED" && input.outbox) this.outboxRows.push(input.outbox(row.id));
    return Promise.resolve({ created: true, record: { ...row } });
  }

  findById(id: string): Promise<IntegrationEventEntity | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? { ...row } : null);
  }

  beginAttempt(id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.attempts += 1;
    return Promise.resolve();
  }

  finish(id: string, status: Extract<WebhookEventStatusValue, "PROCESSED" | "IGNORED" | "FAILED">, patch: EventFinishPatch, at: Date): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return Promise.resolve();
    Object.assign(row, {
      status,
      processedAt: status === "FAILED" ? null : at,
      error: status === "FAILED" ? (patch.error ?? "Lỗi không xác định") : null,
      ...(patch.summary !== undefined && { summary: patch.summary }),
      ...(patch.messageId !== undefined && { messageId: patch.messageId }),
    });
    return Promise.resolve();
  }

  private sorted(filter: (r: IntegrationEventEntity) => boolean): IntegrationEventEntity[] {
    return [...this.rows.values()].filter(filter).sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime() || b.id.localeCompare(a.id));
  }

  listByIntegration(integrationId: string, opts: { cursor?: string; limit: number; status?: WebhookEventStatusValue }): Promise<EventCursorPage> {
    const point = opts.cursor ? decodeCursor(opts.cursor) : null;
    const all = this.sorted(
      (r) =>
        r.integrationId === integrationId &&
        (!opts.status || r.status === opts.status) &&
        (!point || r.receivedAt < point.at || (r.receivedAt.getTime() === point.at.getTime() && r.id < point.id))
    );
    const page = all.slice(0, opts.limit);
    const last = page[page.length - 1];
    return Promise.resolve({ items: page.map((r) => ({ ...r })), nextCursor: all.length > opts.limit && last ? encodeCursor(last.receivedAt, last.id) : null });
  }

  listAdmin(filter: EventListFilter, page: number, limit: number): Promise<{ items: IntegrationEventEntity[]; total: number }> {
    const all = this.sorted(
      (r) =>
        (!filter.provider || r.provider === filter.provider) &&
        (!filter.status || r.status === filter.status) &&
        (!filter.integrationIds || (r.integrationId !== null && filter.integrationIds.includes(r.integrationId))) &&
        (!filter.from || r.receivedAt >= filter.from) &&
        (!filter.to || r.receivedAt <= filter.to)
    );
    const start = (page - 1) * limit;
    return Promise.resolve({ items: all.slice(start, start + limit).map((r) => ({ ...r })), total: all.length });
  }

  countReplays(originalId: string): Promise<number> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.replayOf === originalId).length);
  }

  listReplays(originalId: string, limit: number): Promise<IntegrationEventEntity[]> {
    return Promise.resolve(this.sorted((r) => r.replayOf === originalId).slice(0, limit).map((r) => ({ ...r })));
  }

  countByProviderSince(since: Date): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const r of this.rows.values()) if (r.receivedAt >= since) out[r.provider] = (out[r.provider] ?? 0) + 1;
    return Promise.resolve(out);
  }

  latestErrors(): Promise<Record<string, { error: string; at: Date } | undefined>> {
    const out: Record<string, { error: string; at: Date } | undefined> = {};
    for (const r of this.sorted((x) => x.status === "FAILED" && x.error !== null)) out[r.provider] ??= { error: r.error ?? "", at: r.receivedAt };
    return Promise.resolve(out);
  }

  clearPayloadBefore(before: Date): Promise<number> {
    let count = 0;
    for (const r of this.rows.values()) {
      if (r.receivedAt < before) {
        r.payload = null;
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  deleteBefore(before: Date): Promise<number> {
    let count = 0;
    for (const [id, r] of this.rows) {
      if (r.receivedAt < before) {
        this.rows.delete(id);
        count += 1;
      }
    }
    return Promise.resolve(count);
  }
}
