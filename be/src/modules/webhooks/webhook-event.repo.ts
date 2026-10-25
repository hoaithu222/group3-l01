import { Prisma, type WebhookEvent, type WebhookEventStatus, type WebhookProvider } from "@prisma/client";
import { prisma } from "../../infrastructure/database";

export interface WebhookEventRecord {
  id: string;
  provider: WebhookProvider;
  eventId: string;
  type: string;
  roomName: string | null;
  payloadHash: string;
  payload: unknown;
  status: WebhookEventStatus;
  error: string | null;
  attempts: number;
  receivedAt: Date;
  processedAt: Date | null;
  /** (p5-03) Chỉ có ở sự kiện tích hợp; LiveKit để trống. Tuỳ chọn để bản giả cũ của p0-08 vẫn thoả interface. */
  integrationId?: string | null;
  summary?: string | null;
  messageId?: string | null;
  replayOf?: string | null;
}

export interface CreateWebhookEventInput {
  provider: WebhookProvider;
  eventId: string;
  type: string;
  roomName: string | null;
  /** sha256(rawBody) hex — KHÔNG lưu nguyên payload. */
  payloadHash: string;
  /** Bản rút gọn đã lọc (JSON thuần). */
  payload: unknown;
  /** (p5-03) Kết nối `Integration` khớp sự kiện (null/vắng = không khớp kết nối nào). */
  integrationId?: string | null;
  /** (p5-03) Tóm tắt 1 dòng (đã che dữ liệu nhạy cảm). */
  summary?: string | null;
  /** (p5-03) Sự kiện gốc khi đây là bản phát lại. */
  replayOf?: string | null;
}

/** Truy cập `WebhookEvent` (p0-08 be.md §1 `webhook-event.repo.ts`) — dùng chung cho mọi provider (p5-03 dùng lại). */
export interface IWebhookEventRepository {
  /**
   * `null` khi đã có `(provider, eventId)` (unique) — webhook đến lặp. Lỗi khác → ném (500 để nhà cung cấp retry).
   * `tx` (p5-03, tuỳ chọn): ghi trong transaction của caller (vd cùng `outbox.add`). Khi có `tx`, P2002 KHÔNG bị nuốt mà ném lên — nó đã làm
   * HỎNG transaction nên caller phải bắt NGOÀI `withTransaction` (không catch-and-continue trong transaction đã abort); dùng `isUniqueViolation`.
   */
  create(input: CreateWebhookEventInput, tx?: Prisma.TransactionClient): Promise<WebhookEventRecord | null>;
  findById(id: string): Promise<WebhookEventRecord | null>;
  /** `attempts += 1` trước mỗi lần xử lý. */
  beginAttempt(id: string): Promise<void>;
  markFinished(id: string, status: Extract<WebhookEventStatus, "PROCESSED" | "IGNORED">, at: Date): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  /** `RECEIVED` quá `olderThan` (job `webhook.sweep` đẩy lại). */
  findStaleReceived(provider: WebhookProvider, olderThan: Date, limit: number): Promise<Array<{ id: string; eventId: string }>>;
  /** Xoá `PROCESSED`/`IGNORED` nhận trước `before` (job `webhook.prune`); trả số bản ghi đã xoá. */
  deleteFinishedBefore(provider: WebhookProvider, before: Date): Promise<number>;
  lastReceivedAt(provider: WebhookProvider): Promise<Date | null>;
}

function toRecord(row: WebhookEvent): WebhookEventRecord {
  return { ...row };
}

/** Lỗi trùng khoá unique (`P2002`) — webhook đến lặp `(provider, eventId)`. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export class PrismaWebhookEventRepository implements IWebhookEventRepository {
  async create(input: CreateWebhookEventInput, tx?: Prisma.TransactionClient): Promise<WebhookEventRecord | null> {
    try {
      const row = await (tx ?? prisma).webhookEvent.create({
        data: {
          provider: input.provider,
          eventId: input.eventId,
          type: input.type,
          // Ghi `null` tường minh cho trường về sau lọc/đặt lại (Prisma+Mongo: vắng mặt ≠ null).
          roomName: input.roomName,
          payloadHash: input.payloadHash,
          payload: input.payload as Prisma.InputJsonValue,
          status: "RECEIVED",
          error: null,
          attempts: 0,
          processedAt: null,
          integrationId: input.integrationId ?? null,
          summary: input.summary ?? null,
          messageId: null,
          replayOf: input.replayOf ?? null,
        },
      });
      return toRecord(row);
    } catch (err) {
      // Trong transaction của caller, P2002 đã làm hỏng transaction → ném lên để caller xử lý NGOÀI `withTransaction`.
      if (!tx && isUniqueViolation(err)) return null;
      throw err;
    }
  }

  async findById(id: string): Promise<WebhookEventRecord | null> {
    const row = await prisma.webhookEvent.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async beginAttempt(id: string): Promise<void> {
    await prisma.webhookEvent.update({ where: { id }, data: { attempts: { increment: 1 } } });
  }

  async markFinished(id: string, status: "PROCESSED" | "IGNORED", at: Date): Promise<void> {
    await prisma.webhookEvent.update({ where: { id }, data: { status, processedAt: at, error: null } });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await prisma.webhookEvent.update({ where: { id }, data: { status: "FAILED", error } });
  }

  async findStaleReceived(provider: WebhookProvider, olderThan: Date, limit: number) {
    return prisma.webhookEvent.findMany({
      where: { provider, status: "RECEIVED", receivedAt: { lt: olderThan } },
      orderBy: { receivedAt: "asc" },
      take: limit,
      select: { id: true, eventId: true },
    });
  }

  async deleteFinishedBefore(provider: WebhookProvider, before: Date): Promise<number> {
    const { count } = await prisma.webhookEvent.deleteMany({
      where: { provider, status: { in: ["PROCESSED", "IGNORED"] }, receivedAt: { lt: before } },
    });
    return count;
  }

  async lastReceivedAt(provider: WebhookProvider): Promise<Date | null> {
    const row = await prisma.webhookEvent.findFirst({
      where: { provider },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    });
    return row?.receivedAt ?? null;
  }
}
