import { Prisma, type SystemConfig } from "@prisma/client";
import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { env } from "../../../core/config";
import { logger } from "../../../infrastructure/logger";
import type { SystemConfigRecord } from "../entities/system-config.interface";
import type {
  ISystemConfigRepository,
  UpsertSystemConfigInput,
  UpsertSystemConfigResult,
} from "./system-config.repository.interface";

function toRecord(doc: SystemConfig): SystemConfigRecord {
  return {
    key: doc.key,
    value: (doc.value as Record<string, unknown> | null) ?? {},
    version: doc.version,
    updatedBy: doc.updatedBy,
    reason: doc.reason,
    updatedAt: doc.updatedAt,
  };
}

export class PrismaSystemConfigRepository implements ISystemConfigRepository {
  async findByKey(key: string): Promise<SystemConfigRecord | null> {
    const doc = await prisma.systemConfig.findUnique({ where: { key } });
    return doc ? toRecord(doc) : null;
  }

  async findAll(): Promise<SystemConfigRecord[]> {
    const docs = await prisma.systemConfig.findMany();
    return docs.map(toRecord);
  }

  /**
   * Update `version = expectedVersion` (không match → conflict) hoặc tạo mới
   * khi chưa có document VÀ `expectedVersion === 0`. Ghi `OutboxEvent
   * config.changed` (queue `notifications`, job `config.broadcast`) TRONG
   * CÙNG transaction — `dedupeKey` theo CỬA SỔ debounce (be.md §7) nên nhiều
   * PUT liên tiếp trong cùng cửa sổ chỉ tạo 1 outbox row: các lần sau KIỂM
   * TỒN TẠI trước rồi bỏ qua (xem `scheduleBroadcast` — KHÔNG dựa vào bắt `P2002`).
   */
  async upsertWithVersionCheck(input: UpsertSystemConfigInput): Promise<UpsertSystemConfigResult> {
    return withTransaction(async (tx) => {
      const existing = await tx.systemConfig.findUnique({ where: { key: input.key } });

      if (!existing) {
        if (input.expectedVersion !== 0) return { conflict: true, current: null };
        const created = await tx.systemConfig.create({
          data: {
            key: input.key,
            value: input.value as Prisma.InputJsonValue,
            version: 1,
            updatedBy: input.updatedBy,
            reason: input.reason,
          },
        });
        await this.scheduleBroadcast(tx, input.key);
        return { conflict: false, record: toRecord(created) };
      }

      if (existing.version !== input.expectedVersion) return { conflict: true, current: toRecord(existing) };

      const updated = await tx.systemConfig.update({
        where: { key: input.key },
        data: {
          value: input.value as Prisma.InputJsonValue,
          version: { increment: 1 },
          updatedBy: input.updatedBy,
          reason: input.reason,
        },
      });
      await this.scheduleBroadcast(tx, input.key);
      return { conflict: false, record: toRecord(updated) };
    });
  }

  private async scheduleBroadcast(tx: Prisma.TransactionClient, key: string): Promise<void> {
    const windowMs = env.CONFIG_BROADCAST_DEBOUNCE_MS;
    // `windowMs = 0` (tắt debounce): `floor(now / 0)` = Infinity → mọi lần ghi cùng MỘT khoá. Dùng mốc thời gian để mỗi lần một hàng.
    const bucket = windowMs > 0 ? Math.floor(Date.now() / windowMs) : Date.now();
    const dedupeKey = `config.broadcast:window:${bucket}`;
    // ⛔ KHÔNG `try { outbox.add } catch (P2002)`: trong transaction Mongo, vi phạm unique làm HỎNG cả transaction — commit lỗi, request 500 và MẤT
    // luôn thay đổi cấu hình (hai admin, hoặc hai công tắc lưu liên tiếp trong cùng cửa sổ 2 s). Kiểm tồn tại TRƯỚC; hai giao dịch đua cùng
    // khoá MỚI sẽ gặp write-conflict (P2034) và `withTransaction` chạy lại — lần sau thấy hàng đã commit nên bỏ qua.
    const scheduled = await tx.outboxEvent.findUnique({ where: { dedupeKey }, select: { id: true } });
    if (scheduled) {
      logger.debug("[system-config] Broadcast đã lên lịch trong cùng cửa sổ debounce, bỏ qua", { key, dedupeKey });
      return;
    }
    await outbox.add(tx, {
      type: "config.changed",
      aggregateType: "SystemConfig",
      aggregateId: key,
      queue: "notifications",
      jobName: "config.broadcast",
      dedupeKey,
      delayMs: windowMs,
      payload: { keys: [key] },
    });
  }
}
