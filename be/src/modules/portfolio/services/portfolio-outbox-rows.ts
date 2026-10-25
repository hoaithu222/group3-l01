import type { OutboxEventInput } from "../../../infrastructure/queue";
import { DOMAIN_EVENTS, eventKeys, type PortfolioBuildPayload, type PortfolioPublishedPayload, type PortfolioUnpublishedPayload } from "../../../shared/events/domain-events";

/** Hàng outbox của `portfolio` — MỘT nơi dựng để producer/consumer không lệch (jobName/queue/dedupeKey khớp be.md §7). */
export const PORTFOLIO_QUEUE = "reports" as const;
export const PORTFOLIO_BUILD_JOB = "portfolio.build" as const;
export const PORTFOLIO_PURGE_JOB = "portfolio.purge-build" as const;
/** MỘT processor `reports/portfolio.events` nhận `portfolio.published|unpublished` rồi chuyển cho các SINK đã đăng ký (p6-08 …) — như `skill.events`. */
export const PORTFOLIO_EVENTS_JOB = "portfolio.events" as const;

export function buildRow(portfolioId: string, buildVersion: number): OutboxEventInput {
  const payload: PortfolioBuildPayload = { event: DOMAIN_EVENTS.PORTFOLIO_BUILD, portfolioId, buildVersion };
  return {
    type: DOMAIN_EVENTS.PORTFOLIO_BUILD,
    aggregateType: "Portfolio",
    aggregateId: portfolioId,
    queue: PORTFOLIO_QUEUE,
    jobName: PORTFOLIO_BUILD_JOB,
    dedupeKey: eventKeys.portfolioBuild(portfolioId, buildVersion),
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** Xoá object của build sau `delayMs` (trần nginx 5 phút + dư) — job bỏ qua nếu build đó đang được phục vụ. */
export function purgeRow(portfolioId: string, buildVersion: number, delayMs: number, at: Date): OutboxEventInput {
  return {
    type: PORTFOLIO_PURGE_JOB,
    aggregateType: "Portfolio",
    aggregateId: portfolioId,
    queue: PORTFOLIO_QUEUE,
    jobName: PORTFOLIO_PURGE_JOB,
    dedupeKey: eventKeys.portfolioPurgeBuild(portfolioId, buildVersion, at.getTime()),
    delayMs,
    payload: { portfolioId, buildVersion },
  };
}

export function publishedRow(input: Omit<PortfolioPublishedPayload, "event" | "at">, at: Date): OutboxEventInput {
  const payload: PortfolioPublishedPayload = { event: DOMAIN_EVENTS.PORTFOLIO_PUBLISHED, ...input, at: at.toISOString() };
  return {
    type: DOMAIN_EVENTS.PORTFOLIO_PUBLISHED,
    aggregateType: "Portfolio",
    aggregateId: input.portfolioId,
    queue: PORTFOLIO_QUEUE,
    jobName: PORTFOLIO_EVENTS_JOB,
    dedupeKey: eventKeys.portfolioPublished(input.portfolioId, input.buildVersion),
    payload: payload as unknown as Record<string, unknown>,
  };
}

export function unpublishedRow(input: Omit<PortfolioUnpublishedPayload, "event" | "at">, at: Date): OutboxEventInput {
  const payload: PortfolioUnpublishedPayload = { event: DOMAIN_EVENTS.PORTFOLIO_UNPUBLISHED, ...input, at: at.toISOString() };
  return {
    type: DOMAIN_EVENTS.PORTFOLIO_UNPUBLISHED,
    aggregateType: "Portfolio",
    aggregateId: input.portfolioId,
    queue: PORTFOLIO_QUEUE,
    jobName: PORTFOLIO_EVENTS_JOB,
    dedupeKey: eventKeys.portfolioUnpublished(input.portfolioId, at.getTime()),
    payload: payload as unknown as Record<string, unknown>,
  };
}
