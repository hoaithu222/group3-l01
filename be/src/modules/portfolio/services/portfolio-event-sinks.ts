import { logger } from "../../../infrastructure/logger";
import type { PortfolioPublishedPayload, PortfolioUnpublishedPayload } from "../../../shared/events/domain-events";

/**
 * Sự kiện RA của portfolio (`portfolio.published|unpublished`) — MỘT processor `reports/portfolio.events` (mỗi cặp queue/jobName chỉ một processor) chuyển cho các SINK đã đăng ký:
 * p6-08 (index nhà tuyển dụng, `portfolioUrl` của thẻ ứng viên) gọi `registerPortfolioEventSink` (qua `portfolio/public.ts`) thay vì đòi thêm hàng outbox. Sink PHẢI idempotent
 * theo `(portfolioId, event, at)`. Mẫu y hệt `career/services/skill-events.ts`.
 */
export type PortfolioEventPayload = PortfolioPublishedPayload | PortfolioUnpublishedPayload;
export type PortfolioEventSink = (payload: PortfolioEventPayload) => Promise<void>;

const sinks = new Map<string, PortfolioEventSink>();

export function registerPortfolioEventSink(name: string, sink: PortfolioEventSink): void {
  sinks.set(name, sink);
}

/** Chỉ dùng trong test. */
export function clearPortfolioEventSinks(): void {
  sinks.clear();
}

/** Chạy MỌI sink (không dừng ở lỗi đầu) rồi ném lỗi gộp để BullMQ retry — sink đã thành công chạy lại vô hại. */
export async function dispatchPortfolioEvent(payload: PortfolioEventPayload): Promise<void> {
  const entries = [...sinks.entries()];
  if (entries.length === 0) return;
  const results = await Promise.allSettled(entries.map(([, sink]) => sink(payload)));
  const failed = entries.flatMap(([name], i) => (results[i].status === "rejected" ? [name] : []));
  if (failed.length > 0) {
    logger.warn("[portfolio.events] sink lỗi", { failed, event: payload.event, portfolioId: payload.portfolioId });
    throw new Error(`portfolio.events: sink lỗi: ${failed.join(", ")}`);
  }
}
