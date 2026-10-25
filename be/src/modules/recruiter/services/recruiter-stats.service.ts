import { periodKeyOf } from "../domain/periods";
import type { StatsQuery } from "../dtos";
import type { MonthlyOfferStats } from "../repositories/job-offer.repository.interface";
import { OfferQuotaService } from "./offer-quota.service";
import type { RecruiterDeps } from "./recruiter.deps";

export interface RecruiterStatsView {
  byMonth: MonthlyOfferStats[];
  topCompanies: Array<{ companyId: string; name: string; sent: number }>;
  /** Số công ty đã dùng hết hạn mức tháng HIỆN TẠI (kỳ theo Asia/Ho_Chi_Minh). */
  companiesAtQuota: number;
  /** Số ứng viên đang có bản chiếu tìm kiếm (Open to work). */
  openToWorkCount: number;
}

/** Thống kê tuyển dụng cho vận hành (`GET /admin/recruiter/stats`) — CHỈ số đếm, không nội dung/tên sinh viên/lời mời (be.md §4). */
export class RecruiterStatsService {
  private readonly quota: OfferQuotaService;

  constructor(private readonly d: RecruiterDeps) {
    this.quota = new OfferQuotaService(d);
  }

  async stats(q: StatsQuery): Promise<RecruiterStatsView> {
    const period = periodKeyOf(this.d.now());
    const [byMonth, top, usage, openToWorkCount] = await Promise.all([
      this.d.offers.statsByMonth(q.from, q.to, q.tz),
      this.d.offers.topCompanies(q.from, q.to, 10),
      this.d.usage.listByPeriod(period),
      this.d.index.count(),
    ]);
    const companies = await this.d.companies.findMany([...new Set([...top.map((t) => t.companyId), ...usage.map((u) => u.companyId)])]);
    let companiesAtQuota = 0;
    for (const u of usage) {
      const c = companies.get(u.companyId);
      if (c && u.used >= (await this.quota.quotaOf(c))) companiesAtQuota += 1;
    }
    return {
      byMonth,
      topCompanies: top.flatMap((t) => {
        const c = companies.get(t.companyId);
        return c ? [{ companyId: t.companyId, name: c.name, sent: t.sent }] : [];
      }),
      companiesAtQuota,
      openToWorkCount,
    };
  }
}
