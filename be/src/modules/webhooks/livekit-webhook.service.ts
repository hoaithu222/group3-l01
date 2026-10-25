import { createHash } from "node:crypto";
import { AppError } from "../../core/exceptions";
import { ErrorCode } from "../../core/utils/error.codes";
import { logger } from "../../infrastructure/logger";
import { livekitWebhookTotal } from "../../infrastructure/metrics";
import {
  isKnownLiveKitEventType,
  toStoredPayload,
  type NormalizedLiveKitEvent,
} from "../../infrastructure/media";
import type { ILiveKitEventQueue } from "./livekit-event.queue";
import type { IWebhookEventRepository } from "./webhook-event.repo";

export type VerifyLiveKitWebhook = (rawBody: Buffer, authHeader: string | undefined) => Promise<NormalizedLiveKitEvent>;

export interface LiveKitWebhookDeps {
  repo: IWebhookEventRepository;
  queue: ILiveKitEventQueue;
  verify: VerifyLiveKitWebhook;
}

/** Nhãn `type` của metric chỉ nhận loại đã biết (còn lại "other") — chặn bùng nổ cardinality từ đầu vào ngoài. */
export function metricType(type: string | undefined): string {
  if (!type) return "unknown";
  return isKnownLiveKitEventType(type) ? type : "other";
}

/**
 * Nhận webhook LiveKit (p0-08 be.md §5.3): xác thực chữ ký trên RAW body → ghi `WebhookEvent` (unique
 * `(LIVEKIT, event.id)`) → xếp job `livekit.event` → 2xx. Chỉ trả thành công SAU KHI đã ghi DB (lỗi ghi → ném, 500,
 * LiveKit tự retry — không 200 giả). Trùng `event.id` → coi như đã nhận (không xử lý lại).
 */
export class LiveKitWebhookService {
  constructor(private readonly deps: LiveKitWebhookDeps) {}

  async receive(rawBody: Buffer, authHeader: string | undefined): Promise<{ duplicate: boolean }> {
    let event: NormalizedLiveKitEvent;
    try {
      event = await this.deps.verify(rawBody, authHeader);
    } catch (err) {
      const invalid = err instanceof AppError && err.errorCode === ErrorCode.MEDIA_002;
      livekitWebhookTotal.inc({ type: "unknown", result: invalid ? "invalid" : "error" });
      throw err;
    }
    const type = metricType(event.type);

    let record;
    try {
      record = await this.deps.repo.create({
        provider: "LIVEKIT",
        eventId: event.id,
        type: event.type,
        roomName: event.roomName,
        payloadHash: createHash("sha256").update(rawBody).digest("hex"),
        payload: toStoredPayload(event),
      });
    } catch (err) {
      livekitWebhookTotal.inc({ type, result: "error" });
      logger.error("[livekit.webhook] Không ghi được WebhookEvent — trả 5xx để LiveKit thử lại", {
        eventId: event.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    if (!record) {
      livekitWebhookTotal.inc({ type, result: "duplicate" });
      return { duplicate: true };
    }

    livekitWebhookTotal.inc({ type, result: "accepted" });
    // Lỗi xếp job KHÔNG làm hỏng webhook: bản ghi đã bền, `webhook.sweep` đẩy lại `RECEIVED` quá 60 s.
    await this.deps.queue.enqueue(record.id, event.id);
    return { duplicate: false };
  }
}
