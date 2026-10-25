import type { PreviewQueryDto } from "../dtos";
import type { IPortfolioProjectRepository } from "../repositories/portfolio-project.repository.interface";
import type { IPortfolioRepository } from "../repositories/portfolio.repository.interface";
import type { PortfolioPageComposer } from "./portfolio-page.composer";
import { portfolioErrors } from "./portfolio.errors";

/** `GET /me/portfolio/preview` — HTML bản NHÁP từ trạng thái hiện tại (số liệu = snapshot đã lưu, ảnh nhúng data URI); tuỳ chọn thử mẫu/màu khác mà không lưu. */
export class PortfolioPreviewService {
  constructor(
    private readonly portfolios: IPortfolioRepository,
    private readonly projects: IPortfolioProjectRepository,
    private readonly composer: PortfolioPageComposer,
    private readonly now: () => Date = () => new Date()
  ) {}

  async render(userId: string, query: PreviewQueryDto): Promise<string> {
    const pf = await this.portfolios.findByUserId(userId);
    if (!pf) throw portfolioErrors.notFound("Chưa có hồ sơ portfolio để xem trước");
    const projects = await this.projects.listByPortfolio(pf.id);
    const themeOverride = { ...(query.template && { template: query.template }), ...(query.accent && { accent: query.accent }) };
    return (await this.composer.compose(pf, projects, { mode: "preview", generatedAt: this.now(), themeOverride })).html;
  }
}
