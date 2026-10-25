import { dispatchLiveKitEvent, fromStoredRow, type LiveKitHandlerResult, type NormalizedLiveKitEvent } from "../../infrastructure/media";
import { logger } from "../../infrastructure/logger";
import { livekitWebhookProcessSeconds, livekitWebhookTotal } from "../../infrastructure/metrics";
import { metricType } from "./livekit-webhook.service";
import type { IWebhookEventRepository } from "./webhook-event.repo";

export type LiveKitProcessOutcome = LiveKitHandlerResult | "SKIPPED";

const ERROR_MAX_CHARS = 300;

export class LiveKitEventProcessor {
  constructor(
    private readonly repo: IWebhookEventRepository,
    private readonly dispatch: (e: NormalizedLiveKitEvent) => Promise<LiveKitHandlerResult> = dispatchLiveKitEvent,
    private readonly now: () => Date = () => new Date()
  ) {}

  /**
   * Xử lý 1 `WebhookEvent` (job `livekit.event`, be.md §5.4). Idempotent: `PROCESSED`/`IGNORED` → bỏ qua. `RECEIVED` và
   * `FAILED` (job retry) đều được chạy — be.md ghi "status ≠ RECEIVED thì bỏ qua" nhưng như vậy mọi retry sau lần lỗi
   * đầu (status đã thành FAILED) sẽ bị bỏ qua, nên retry chỉ loại 2 trạng thái đã xong.
   * Handler lỗi → ghi `FAILED` + `error` rồi ném lại để BullMQ retry (tối đa 5, backoff 2 s).
   */
  async process(webhookEventId: string): Promise<LiveKitProcessOutcome> {
    const row = await this.repo.findById(webhookEventId);
    if (!row) {
      logger.warn("[livekit.event] Không thấy WebhookEvent (đã bị dọn?)", { webhookEventId });
      return "SKIPPED";
    }
    if (row.provider !== "LIVEKIT" || row.status === "PROCESSED" || row.status === "IGNORED") return "SKIPPED";

    const type = metricType(row.type);
    const startedAt = process.hrtime.bigint();
    await this.repo.beginAttempt(row.id);
    try {
      const outcome = await this.dispatch(fromStoredRow(row));
      await this.repo.markFinished(row.id, outcome, this.now());
      livekitWebhookTotal.inc({ type, result: outcome === "PROCESSED" ? "processed" : "ignored" });
      return outcome;
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, ERROR_MAX_CHARS);
      livekitWebhookTotal.inc({ type, result: "failed" });
      try {
        await this.repo.markFailed(row.id, message);
      } catch (markErr) {
        logger.error("[livekit.event] Không ghi được trạng thái FAILED", {
          webhookEventId: row.id,
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
      throw err;
    } finally {
      livekitWebhookProcessSeconds.observe(Number(process.hrtime.bigint() - startedAt) / 1e9);
    }
  }
}
