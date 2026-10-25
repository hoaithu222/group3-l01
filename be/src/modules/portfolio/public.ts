/**
 * Barrel CÔNG KHAI của `portfolio` cho module khác (ngoại lệ có chủ đích của luật "không import chéo module", `architecture.md`) — nền cho p6-08 (recruiter board).
 * KHÔNG import `portfolio/services/*` hay `portfolio/repositories/*` trực tiếp.
 *
 *  - `registerPortfolioEventSink(name, sink)` — nhận `portfolio.published|unpublished` (job `reports/portfolio.events`), idempotent phía sink. p6-08 lập chỉ mục
 *    `portfolioUrl` của thẻ ứng viên từ `portfolio.published { userId, url }` và gỡ khi `portfolio.unpublished`.
 *  - `createPortfolioLinkReader()` → `linkOf(userId)` — link công khai hiện hành (chỉ khi đang công khai và không bị gỡ), cho nơi cần đọc trực tiếp thay vì chờ sự kiện.
 */
import { getPortfolioContainer } from "./portfolio.container";

export { registerPortfolioEventSink } from "./services/portfolio-event-sinks";
export type { PortfolioEventPayload, PortfolioEventSink } from "./services/portfolio-event-sinks";
export type { PortfolioPublishedPayload, PortfolioUnpublishedPayload } from "../../shared/events/domain-events";

export interface PortfolioLinkReader {
  /** `null` khi người này chưa có trang công khai (hoặc đã ngừng/bị gỡ). */
  linkOf(userId: string): Promise<{ url: string; portfolioId: string } | null>;
}

export function createPortfolioLinkReader(): PortfolioLinkReader {
  const c = getPortfolioContainer();
  return {
    async linkOf(userId) {
      const pf = await c.portfolios.findByUserId(userId);
      if (!pf || pf.status !== "PUBLISHED" || pf.takenDownAt) return null;
      return c.publish.linkOf(userId);
    },
  };
}
