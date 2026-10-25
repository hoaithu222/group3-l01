import type { PortfolioBuild, PortfolioBuildTrigger } from "../entities/portfolio.interface";
import type { IPortfolioBuildRepository } from "../repositories/portfolio-build.repository.interface";
import type { IPortfolioRepository } from "../repositories/portfolio.repository.interface";
import type { IPortfolioOutbox, TxHandle } from "../repositories/tx";
import { buildRow } from "./portfolio-outbox-rows";

export interface ScheduleBuildInput {
  portfolioId: string;
  /** `Portfolio.version` lúc yêu cầu (ghi vào build để client biết "có thay đổi chưa công khai"). */
  portfolioVersion: number;
  trigger: PortfolioBuildTrigger;
  createdBy: string | null;
  /** CAS phiên bản hồ sơ (Publish của người dùng); vắng = build lại do hệ thống. */
  expectedVersion?: number;
}

/**
 * Xếp MỘT lệnh dựng trang: cấp `buildVersion` (`$inc nextBuildVersion` nguyên tử) + tạo `PortfolioBuild QUEUED` + hàng outbox `reports/portfolio.build` — CẢ BA trong transaction của
 * caller (crash giữa chừng không để lại build mồ côi/lệnh bị mất). `null` khi hồ sơ bị gỡ / lệch phiên bản / không tồn tại (caller đọc lại để phân biệt).
 */
export class PortfolioBuildScheduler {
  constructor(
    private readonly portfolios: IPortfolioRepository,
    private readonly builds: IPortfolioBuildRepository,
    private readonly outbox: IPortfolioOutbox
  ) {}

  async schedule(tx: TxHandle, input: ScheduleBuildInput): Promise<PortfolioBuild | null> {
    const buildVersion = await this.portfolios.reserveBuildVersion(input.portfolioId, { expectedVersion: input.expectedVersion }, tx);
    if (buildVersion === null) return null;
    const build = await this.builds.create({ portfolioId: input.portfolioId, buildVersion, trigger: input.trigger, portfolioVersion: input.portfolioVersion, createdBy: input.createdBy }, tx);
    await this.outbox.add(tx, buildRow(input.portfolioId, buildVersion));
    return build;
  }
}
