import type { AuthUser } from "../../../core/types/express";
import type { ReportTargetExtension, ReportTargetLookup } from "../../../shared/ports/report.port";
import type { IPortfolioRepository } from "../repositories/portfolio.repository.interface";

export const PORTFOLIO_REPORT_TARGET = "PORTFOLIO";

/**
 * Điểm cắm của `moderation` cho đích `PORTFOLIO` (`shared/ports/report.port`) — đăng ký lúc boot ở API (`registerPortfolioModule`) VÀ worker (`jobs/portfolio.jobs.ts`, vì
 * `report.events` chạy ở worker). Chỉ trang ĐANG công khai mới báo cáo được (nháp/đã ngừng/đã gỡ → 404 trung tính, không lộ tồn tại); chủ hồ sơ không tự báo cáo;
 * mọi báo cáo do quản trị nền tảng xử lý (`PLATFORM_ONLY`, `moderation:update` → `POST /admin/portfolios/:id/takedown`).
 */
export class PortfolioReportTarget implements ReportTargetExtension {
  constructor(private readonly portfolios: IPortfolioRepository) {}

  async resolve(reporter: AuthUser, targetId: string): Promise<ReportTargetLookup> {
    const pf = await this.portfolios.findById(targetId);
    if (!pf || pf.status !== "PUBLISHED" || pf.takenDownAt) return "NOT_FOUND";
    if (pf.userId === reporter.id) return "SELF";
    return {
      targetType: PORTFOLIO_REPORT_TARGET,
      targetId: pf.id,
      groupKey: `${PORTFOLIO_REPORT_TARGET}:${pf.id}`,
      scopeType: null,
      scopeId: null,
      scopeIsPrivate: false,
      workspaceId: null,
      targetAuthorId: pf.userId,
      handlerLevel: "PLATFORM_ONLY",
    };
  }
}
