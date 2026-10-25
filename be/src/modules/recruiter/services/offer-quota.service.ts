import { periodKeyOf, remainingQuota } from "../domain/periods";
import type { Company } from "../entities/recruiter.interface";
import type { TxHandle } from "../repositories/tx";
import { recruiterErrors } from "./recruiter.errors";
import type { RecruiterDeps } from "./recruiter.deps";

export interface UsageView {
  period: string;
  used: number;
  quota: number;
  remaining: number;
  tier: string;
}

/**
 * Hạn mức lời mời/tháng (be.md §5 "Gửi lời mời" bước 4). Hạn mức = `Company.offerQuotaOverride ?? SystemConfig recruiter.offerQuotaByTier[tier]`;
 * kỳ = tháng địa phương Asia/Ho_Chi_Minh. Trừ lượt bằng `updateMany where used < quota` + `$inc` TRONG transaction gửi lời mời — gửi song song không vượt hạn mức,
 * transaction huỷ (trùng lời mời mở, lỗi khác) thì lượt không bị trừ; thu hồi/hết hạn KHÔNG hoàn lượt. Hàng đếm tạo trước NGOÀI transaction (`ensure`).
 */
export class OfferQuotaService {
  constructor(private readonly d: Pick<RecruiterDeps, "usage" | "config" | "now">) {}

  async quotaOf(company: Pick<Company, "tier" | "offerQuotaOverride">): Promise<number> {
    if (company.offerQuotaOverride !== null) return company.offerQuotaOverride;
    return (await this.d.config.offerQuotaByTier())[company.tier];
  }

  async usageOf(company: Company, at: Date = this.d.now()): Promise<UsageView> {
    const period = periodKeyOf(at);
    const [used, quota] = await Promise.all([this.d.usage.used(company.id, period), this.quotaOf(company)]);
    return { period, used, quota, remaining: remainingQuota(quota, used), tier: company.tier };
  }

  /** Tạo hàng đếm của kỳ hiện tại (idempotent) — gọi TRƯỚC transaction gửi lời mời. */
  ensure(company: Company, at: Date): Promise<void> {
    return this.d.usage.ensure(company.id, periodKeyOf(at));
  }

  /** Trừ MỘT lượt hoặc ném `RECR_005` (`details.{period,used,quota}`). Gọi TRONG transaction. */
  async consume(tx: TxHandle, company: Company, at: Date): Promise<void> {
    const period = periodKeyOf(at);
    const quota = await this.quotaOf(company);
    if (await this.d.usage.consume(company.id, period, quota, tx)) return;
    throw recruiterErrors.quotaExceeded({ period, used: await this.d.usage.used(company.id, period), quota });
  }
}
