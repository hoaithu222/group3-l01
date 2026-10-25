import express, { Router, type ErrorRequestHandler } from "express";
import { AppError } from "../../core/exceptions";
import { LIMITS } from "../../core/constants/limits";
import { ErrorCode } from "../../core/utils/error.codes";
import { createWebhooksController } from "./webhooks.controller";
import { getWebhooksContainer } from "./webhooks.container";
import type { LiveKitWebhookService } from "./livekit-webhook.service";

/** LiveKit gửi `Content-Type: application/webhook+json`; trần 256 KB (sự kiện nhỏ) chống DoS trên route không xác thực. */
export const WEBHOOK_RAW_BODY: { type: string[]; limit: string } = {
  type: ["application/webhook+json", "application/json"],
  limit: "256kb",
};

/** (p5-03) Webhook GitHub/GitLab/Figma: `application/json`, trần `LIMITS.integration.webhookBodyMaxBytes` (1 MiB) — commit/PR lớn hơn LiveKit nhiều. */
export const PROVIDER_WEBHOOK_RAW_BODY: { type: string[]; limit: number } = {
  type: ["application/json", "application/*+json"],
  limit: LIMITS.integration.webhookBodyMaxBytes,
};

export function createWebhooksRouter(livekitService: LiveKitWebhookService): Router {
  const router = Router();
  const controller = createWebhooksController(livekitService);

  /**
   * @openapi
   * /webhooks/livekit:
   *   post:
   *     summary: "Nhận webhook LiveKit (raw body + Authorization JWT ký bằng LIVEKIT_API_SECRET)"
   *     tags: [Webhooks]
   *     security: []
   *     responses:
   *       200: { description: "Đã nhận (kể cả sự kiện trùng event.id)" }
   *       401: { description: "MEDIA_002 — chữ ký sai/thiếu hoặc body bị sửa" }
   *       503: { description: "MEDIA_001 — máy chủ media chưa cấu hình" }
   *       500: { description: "Ghi DB lỗi — LiveKit sẽ gửi lại" }
   */
  router.post("/livekit", express.raw(WEBHOOK_RAW_BODY), controller.livekit);

  /**
   * @openapi
   * /webhooks/{provider}:
   *   post:
   *     summary: "Nhận webhook GitHub/GitLab/Figma/Google (RAW body; chữ ký HMAC hoặc secret so sánh hằng thời gian — p5-03)"
   *     tags: [Webhooks]
   *     security: []
   *     parameters:
   *       - { in: path, name: provider, required: true, schema: { type: string, enum: [github, gitlab, google, figma] } }
   *     responses:
   *       202: { description: "Đã ghi nhận (kể cả gửi lặp cùng delivery id hoặc sự kiện bị IGNORED)" }
   *       401: { description: "INT_007 — chữ ký/secret sai hoặc thiếu; KHÔNG tạo WebhookEvent" }
   *       404: { description: "Nhà cung cấp lạ hoặc chưa có handler" }
   *       413: { description: "Vượt trần LIMITS.integration.webhookBodyMaxBytes" }
   */
  router.post("/:provider", express.raw(PROVIDER_WEBHOOK_RAW_BODY), controller.provider);

  // `errorHandler` toàn cục không nhận ra lỗi body-parser (trả 500) — route không xác thực này phải trả 413 rõ ràng
  // khi vượt trần 256 KB (500 sẽ khiến LiveKit thử lại vô ích).
  const tooLarge: ErrorRequestHandler = (err, _req, _res, next) => {
    if ((err as { type?: string } | null)?.type === "entity.too.large") {
      next(new AppError("Nội dung webhook quá lớn", 413, ErrorCode.VAL_001));
      return;
    }
    next(err);
  };
  router.use(tooLarge);

  return router;
}

/**
 * ⚠ `app.ts` PHẢI mount router này (`/api/v1/webhooks`) TRƯỚC `express.json()`/`sanitizeInput` — chữ ký tính trên
 * đúng chuỗi byte gốc, không phải `JSON.stringify(req.body)`. Không mount lần nữa trong `router.ts` (sau body parser
 * thì body đã bị parse/sanitize, mọi chữ ký đều sai).
 */
export default createWebhooksRouter(getWebhooksContainer().service);
