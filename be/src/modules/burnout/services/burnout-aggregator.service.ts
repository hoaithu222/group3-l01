import { LIMITS } from "../../../core/constants/limits";
import type { WellbeingDailyEntity } from "../entities/burnout.interface";
import { dayConfigFrom, isEmptyDay, splitBucketHash, summarizeDay, wellbeingDateOf, type DayConfig } from "../domain/wellbeing-day";
import type { IWellbeingDailyRepository } from "../repositories/daily.repository.interface";
import type { IBurnoutSignalStore } from "../repositories/signal-store";

export interface AggregateInput {
  userId: string;
  /** Ngày wellbeing cần tổng hợp. */
  date: string;
  timezone: string;
  /** Thời điểm bật theo dõi — không tổng hợp ngày TRƯỚC đó (không có dữ liệu ≠ "0 phút"). */
  optedInAt: Date;
}

/**
 * Bucket Redis → `WellbeingDaily` (p7-03 be.md §5 "Aggregator"). Idempotent: cùng HASH cho ra cùng hàng (upsert theo `(userId, date)`); chạy lại khi HASH đã hết hạn/rỗng KHÔNG ghi đè hàng đã có bằng số 0.
 * Không xoá HASH sau khi tổng hợp (job chạy lại/lỡ nhịp vẫn đọc được) — nó tự hết hạn sau `bucketTtlDays` ngày, hoặc bị xoá khi người dùng tắt/xoá dữ liệu.
 */
export class BurnoutAggregatorService {
  private readonly cfg: DayConfig;

  constructor(private readonly d: { store: IBurnoutSignalStore; dailies: IWellbeingDailyRepository; dayConfig?: DayConfig }) {
    this.cfg = d.dayConfig ?? dayConfigFrom(LIMITS.wellbeing);
  }

  /** `null` = không có gì để ghi (ngày trước khi bật theo dõi). */
  async aggregate(input: AggregateInput): Promise<WellbeingDailyEntity | null> {
    if (input.date < wellbeingDateOf(input.optedInAt, input.timezone, this.cfg)) return null;

    const day = splitBucketHash(await this.d.store.readDay(input.userId, input.date));
    const existing = await this.d.dailies.findByDate(input.userId, input.date);
    if (isEmptyDay(day) && existing) return existing;

    return this.d.dailies.upsert({ userId: input.userId, date: input.date, timezone: input.timezone, ...summarizeDay(day, this.cfg) });
  }
}
