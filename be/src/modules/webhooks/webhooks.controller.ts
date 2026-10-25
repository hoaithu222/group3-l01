import type { Request, Response } from "express";
import { AppError, NotFoundError } from "../../core/exceptions";
import { catchAsync } from "../../core/utils/catchAsync";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";
import { ResponseUtils } from "../../core/utils/response";
import { mediaErrors } from "../../infrastructure/media";
import { getProviderWebhookHandler, PROVIDER_WEBHOOK_PATHS } from "./provider-webhook.registry";
import type { LiveKitWebhookService } from "./livekit-webhook.service";

export function createWebhooksController(service: LiveKitWebhookService) {
  /** `POST /webhooks/livekit` — KHÔNG `authenticateToken`/`sanitizeInput`: xác thực bằng chữ ký JWT trên RAW body. */
  const livekit = catchAsync(async (req: Request, res: Response) => {
    // `express.raw` chỉ điền Buffer khi Content-Type khớp; nếu không thì không thể kiểm chữ ký trên byte gốc.
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw mediaErrors.invalidSignature();
    await service.receive(req.body, req.get("Authorization"));
    ResponseUtils.success(res, null, "Đã nhận webhook");
  });

  /**
   * `POST /webhooks/:provider` (p5-03: github|gitlab|google|figma) — RAW body, KHÔNG JWT: handler do module tích hợp đăng ký
   * (`registerProviderWebhookHandler`) xác thực chữ ký/secret bằng so sánh hằng thời gian rồi ghi `WebhookEvent`. 202 khi đã ghi nhận
   * (kể cả gửi lặp/`IGNORED`); provider lạ hoặc chưa có handler → 404; chữ ký sai/thiếu → 401 `INT_007` (không tạo `WebhookEvent`).
   */
  const provider = catchAsync(async (req: Request, res: Response) => {
    const key = req.params.provider ?? "";
    const target = Object.prototype.hasOwnProperty.call(PROVIDER_WEBHOOK_PATHS, key) ? PROVIDER_WEBHOOK_PATHS[key] : undefined;
    const handler = target ? getProviderWebhookHandler(target) : undefined;
    if (!handler) throw new NotFoundError();
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new AppError(ErrorMessages[ErrorCode.INT_007], 401, ErrorCode.INT_007);
    }
    const result = await handler.receive({ rawBody: req.body, headers: req.headers });
    ResponseUtils.success(res, { status: result.status, duplicate: result.duplicate }, "Đã nhận webhook", 202);
  });

  return { livekit, provider };
}
