import type { OutboxEventInput } from "../../../infrastructure/queue";
import type { IntegrationEventEntity, WebhookEventStatusValue } from "../entities/integration.interface";

export type EventProvider = IntegrationEventEntity["provider"];

export interface IngestEventInput {
  provider: EventProvider;
  eventId: string;
  type: string;
  payloadHash: string;
  /** Payload ĐÃ LỌC (`payloadForStorage`) — dùng để phát lại. */
  payload: Record<string, unknown>;
  integrationId: string | null;
  summary: string | null;
  replayOf?: string | null;
  /** `RECEIVED` = xếp job xử lý (cùng transaction với dòng log); `IGNORED` = chỉ ghi nhận. */
  status: Extract<WebhookEventStatusValue, "RECEIVED" | "IGNORED">;
  /** Dòng outbox `integrations.webhook-process` (bắt buộc khi `status = RECEIVED`) — dựng SAU khi biết id dòng log. */
  outbox?: (eventRowId: string) => OutboxEventInput;
}

export interface EventFinishPatch {
  summary?: string | null;
  messageId?: string | null;
  error?: string | null;
}

export interface EventListFilter {
  status?: WebhookEventStatusValue;
  integrationIds?: string[];
  provider?: EventProvider;
  from?: Date;
  to?: Date;
}

export interface EventCursorPage {
  items: IntegrationEventEntity[];
  nextCursor: string | null;
}

/** Truy cập log sự kiện tích hợp — CÙNG bảng `WebhookEvent` của p0-08 (dùng lại `PrismaWebhookEventRepository.create`), thêm truy vấn riêng cho tích hợp. */
export interface IIntegrationEventRepository {
  /**
   * Ghi dòng log (+ outbox cùng transaction nếu `RECEIVED`). Trùng `(provider, eventId)` → `{ created: false }` (KHÔNG xếp job thứ hai). Lỗi DB khác → ném
   * (5xx để nhà cung cấp gửi lại).
   */
  ingest(input: IngestEventInput): Promise<{ created: boolean; record: IntegrationEventEntity | null }>;
  findById(id: string): Promise<IntegrationEventEntity | null>;
  beginAttempt(id: string): Promise<void>;
  finish(id: string, status: Extract<WebhookEventStatusValue, "PROCESSED" | "IGNORED" | "FAILED">, patch: EventFinishPatch, at: Date): Promise<void>;
  listByIntegration(integrationId: string, opts: { cursor?: string; limit: number; status?: WebhookEventStatusValue }): Promise<EventCursorPage>;
  listAdmin(filter: EventListFilter, page: number, limit: number): Promise<{ items: IntegrationEventEntity[]; total: number }>;
  countReplays(originalId: string): Promise<number>;
  /** Các bản phát lại của một sự kiện gốc (mới nhất trước, tối đa `limit`). */
  listReplays(originalId: string, limit: number): Promise<IntegrationEventEntity[]>;
  /** Số sự kiện mỗi nhà cung cấp từ `since` (tab providers ở admin: "sự kiện 24 giờ"). */
  countByProviderSince(since: Date): Promise<Record<string, number>>;
  /** Lỗi gần nhất (`FAILED`) của mỗi nhà cung cấp. */
  latestErrors(): Promise<Record<string, { error: string; at: Date } | undefined>>;
  /** Xoá payload của sự kiện tích hợp nhận trước `before` (quá thời gian lưu — không phát lại được). */
  clearPayloadBefore(before: Date): Promise<number>;
  /** Xoá hẳn dòng log nhận trước `before`. */
  deleteBefore(before: Date): Promise<number>;
}
