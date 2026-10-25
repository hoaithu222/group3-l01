import { prisma } from "../../../infrastructure/database";
import { isPrismaUniqueViolation, type TxHandle } from "./tx";

/** Bộ đếm lời mời/tháng (`CompanyOfferUsage`, `[companyId, period]` unique). */
export interface ICompanyOfferUsageRepository {
  /**
   * Tạo hàng đếm (used 0) NGOÀI transaction gửi lời mời — hai transaction cùng tạo MỘT khoá unique MỚI sẽ P2002 không tự retry (gotcha Mongo); ở đây
   * P2002 = "đã có" → coi như xong.
   */
  ensure(companyId: string, period: string): Promise<void>;
  /** `updateMany where used < quota` + `$inc 1` — `true` khi còn lượt và đã trừ (nguyên tử, gửi song song không vượt hạn mức). */
  consume(companyId: string, period: string, quota: number, tx?: TxHandle): Promise<boolean>;
  used(companyId: string, period: string): Promise<number>;
  /** Số lượt đã dùng theo từng kỳ (kỳ không có hàng = 0). */
  usedByPeriods(companyId: string, periods: readonly string[]): Promise<Map<string, number>>;
  /** Mọi hàng đếm của một kỳ — vận hành tìm công ty chạm hạn mức. */
  listByPeriod(period: string): Promise<Array<{ companyId: string; used: number }>>;
}

export class PrismaCompanyOfferUsageRepository implements ICompanyOfferUsageRepository {
  async ensure(companyId: string, period: string): Promise<void> {
    const existing = await prisma.companyOfferUsage.findUnique({ where: { companyId_period: { companyId, period } }, select: { id: true } });
    if (existing) return;
    try {
      await prisma.companyOfferUsage.create({ data: { companyId, period, used: 0 } });
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
    }
  }

  async consume(companyId: string, period: string, quota: number, tx?: TxHandle): Promise<boolean> {
    const res = await (tx ?? prisma).companyOfferUsage.updateMany({ where: { companyId, period, used: { lt: quota } }, data: { used: { increment: 1 } } });
    return res.count > 0;
  }

  async used(companyId: string, period: string): Promise<number> {
    const r = await prisma.companyOfferUsage.findUnique({ where: { companyId_period: { companyId, period } }, select: { used: true } });
    return r?.used ?? 0;
  }

  async usedByPeriods(companyId: string, periods: readonly string[]): Promise<Map<string, number>> {
    const rows = await prisma.companyOfferUsage.findMany({ where: { companyId, period: { in: [...periods] } }, select: { period: true, used: true } });
    return new Map(rows.map((r) => [r.period, r.used]));
  }

  async listByPeriod(period: string): Promise<Array<{ companyId: string; used: number }>> {
    const rows = await prisma.companyOfferUsage.findMany({ where: { period, used: { gt: 0 } }, select: { companyId: true, used: true } });
    return rows;
  }
}
