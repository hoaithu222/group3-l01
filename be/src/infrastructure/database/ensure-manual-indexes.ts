import type { Prisma } from "@prisma/client";
import { logger } from "../logger";
import { ensureManualIndexes } from "./manual-indexes";
import { prisma } from "./prisma.client";

/**
 * Tự chữa cho index `MANUAL_INDEXES` (2dsphere) — Prisma KHÔNG quản index này nên MỌI lần `prisma db push` (kể cả từ máy khác dùng chung DB) đều
 * xoá nó, khiến `GET /locations/near` trả 500 "unable to find index for $geoNear query" cho tới khi ai đó chạy `npm run db:ensure-indexes`.
 * Hai chỗ dùng: (1) lúc API khởi động (không chặn khởi động); (2) truy vấn `$geoNear` gặp đúng lỗi thiếu index thì tạo lại rồi thử lại MỘT lần.
 * `createIndexes` idempotent: index đã có cùng khoá + tên thì Mongo bỏ qua, nên gọi thừa vô hại.
 */
let inflight: Promise<boolean> | null = null;

/** Lỗi Mongo khi `$geoNear` chạy mà không có index 2dsphere (mã 291 `NoQueryExecutionPlans`). */
export function isMissingGeoIndexError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("unable to find index for $geoNear");
}

/** Đảm bảo mọi `MANUAL_INDEXES`. Không ném: lỗi chỉ ghi log và trả `false`. Gọi đồng thời dùng chung một lượt chạy. */
export function ensureManualIndexesBestEffort(): Promise<boolean> {
  inflight ??= ensureManualIndexes((command) => prisma.$runCommandRaw(command as Prisma.InputJsonObject))
    .then((done) => {
      logger.info(`[db] index thủ công đã đảm bảo: ${done.join(", ")}`);
      return true;
    })
    .catch((err: unknown) => {
      logger.warn("[db] không tạo được index thủ công (2dsphere) — tìm địa điểm gần có thể lỗi 500:", err);
      return false;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
