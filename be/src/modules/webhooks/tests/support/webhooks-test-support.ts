/** Đồ giả dùng chung cho test module `webhooks` (KHÔNG phải test): repo in-memory + hàng đợi giả. */
import type { WebhookEventStatus, WebhookProvider } from "@prisma/client";
import type { ILiveKitEventQueue } from "../../livekit-event.queue";
import type { CreateWebhookEventInput, IWebhookEventRepository, WebhookEventRecord } from "../../webhook-event.repo";

export class InMemoryWebhookEventRepository implements IWebhookEventRepository {
  readonly rows = new Map<string, WebhookEventRecord>();
  /** Đặt để mô phỏng DB lỗi khi ghi (MED-06). */
  failCreateWith: Error | null = null;
  failMarkFailedWith: Error | null = null;
  private seq = 0;

  create(input: CreateWebhookEventInput): Promise<WebhookEventRecord | null> {
    if (this.failCreateWith) return Promise.reject(this.failCreateWith);
    const dup = [...this.rows.values()].some((r) => r.provider === input.provider && r.eventId === input.eventId);
    if (dup) return Promise.resolve(null);
    const row: WebhookEventRecord = {
      id: `we_${++this.seq}`,
      provider: input.provider,
      eventId: input.eventId,
      type: input.type,
      roomName: input.roomName,
      payloadHash: input.payloadHash,
      payload: input.payload,
      status: "RECEIVED",
      error: null,
      attempts: 0,
      receivedAt: new Date(),
      processedAt: null,
    };
    this.rows.set(row.id, row);
    return Promise.resolve({ ...row });
  }

  findById(id: string): Promise<WebhookEventRecord | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? { ...row } : null);
  }

  beginAttempt(id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.attempts += 1;
    return Promise.resolve();
  }

  markFinished(id: string, status: Extract<WebhookEventStatus, "PROCESSED" | "IGNORED">, at: Date): Promise<void> {
    const row = this.rows.get(id);
    if (row) Object.assign(row, { status, processedAt: at, error: null });
    return Promise.resolve();
  }

  markFailed(id: string, error: string): Promise<void> {
    if (this.failMarkFailedWith) return Promise.reject(this.failMarkFailedWith);
    const row = this.rows.get(id);
    if (row) Object.assign(row, { status: "FAILED", error });
    return Promise.resolve();
  }

  findStaleReceived(provider: WebhookProvider, olderThan: Date, limit: number) {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((r) => r.provider === provider && r.status === "RECEIVED" && r.receivedAt < olderThan)
        .slice(0, limit)
        .map((r) => ({ id: r.id, eventId: r.eventId }))
    );
  }

  deleteFinishedBefore(provider: WebhookProvider, before: Date): Promise<number> {
    let count = 0;
    for (const [id, r] of this.rows) {
      if (r.provider === provider && (r.status === "PROCESSED" || r.status === "IGNORED") && r.receivedAt < before) {
        this.rows.delete(id);
        count += 1;
      }
    }
    return Promise.resolve(count);
  }

  lastReceivedAt(provider: WebhookProvider): Promise<Date | null> {
    const dates = [...this.rows.values()].filter((r) => r.provider === provider).map((r) => r.receivedAt.getTime());
    return Promise.resolve(dates.length ? new Date(Math.max(...dates)) : null);
  }
}

export class FakeLiveKitEventQueue implements ILiveKitEventQueue {
  readonly enqueued: Array<{ webhookEventId: string; eventId: string }> = [];
  readonly requeued: Array<{ webhookEventId: string; eventId: string }> = [];
  /** `false` mô phỏng Redis lỗi/quá hạn (queue thật không ném, trả false). */
  ok = true;

  enqueue(webhookEventId: string, eventId: string): Promise<boolean> {
    if (this.ok) this.enqueued.push({ webhookEventId, eventId });
    return Promise.resolve(this.ok);
  }

  requeue(webhookEventId: string, eventId: string): Promise<boolean> {
    if (this.ok) this.requeued.push({ webhookEventId, eventId });
    return Promise.resolve(this.ok);
  }
}
