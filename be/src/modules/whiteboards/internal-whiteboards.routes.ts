import express, { Router, type ErrorRequestHandler } from "express";
import { requireInternalSecret, validateParams, validateQuery } from "../../core/middlewares";
import { LIMITS } from "../../core/constants/limits";
import { AppError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";
import { getWhiteboardsContainer } from "./whiteboards.container";
import { createInternalWhiteboardsController } from "./controllers/internal-whiteboards.controller";
import { internalAccessQuerySchema, internalWhiteboardParamsSchema } from "./dtos";

/** Body PUT state: trần 9 MiB (state tối đa 8 MiB + 1 MiB dư — khớp `KIND_SPECS.whiteboard.stateMaxBytes` của collab). Vượt → 413 `WB_007` (bộ đọc body báo `entity.too.large`, errorHandler toàn cục sẽ trả 500 nếu không map). */
export const INTERNAL_STATE_BODY = { type: "application/octet-stream", limit: LIMITS.whiteboard.stateMaxBytes + 1024 * 1024 } as const;

const controller = createInternalWhiteboardsController(getWhiteboardsContainer());
const router = Router();

// Bí mật kiểm TRƯỚC mọi thứ (kể cả đọc body) để người lạ không ép server đọc 9 MiB. KHÔNG `authenticateToken` (không có người dùng), KHÔNG `requireFeature`
// (tắt cờ giữa chừng không được làm collab mất dữ liệu đang vẽ) — chỉ mạng nội bộ + bí mật.
router.use(requireInternalSecret("collab"));

// Cố ý KHÔNG có `@openapi` — endpoint nội bộ không nằm trong Swagger công khai. Hợp đồng: `collab/README.md` §4.1.
router.get("/:id/access", validateParams(internalWhiteboardParamsSchema), validateQuery(internalAccessQuerySchema), controller.access);
router.get("/:id/state", validateParams(internalWhiteboardParamsSchema), controller.getState);
router.put("/:id/state", validateParams(internalWhiteboardParamsSchema), express.raw(INTERNAL_STATE_BODY), controller.putState);

const tooLarge: ErrorRequestHandler = (err, _req, _res, next) => {
  if ((err as { type?: string } | null)?.type === "entity.too.large") {
    next(new AppError(ErrorMessages[ErrorCode.WB_007], 413, ErrorCode.WB_007, { maxBytes: LIMITS.whiteboard.stateMaxBytes, maxElements: LIMITS.whiteboard.elementsMax }));
    return;
  }
  next(err);
};
router.use(tooLarge);

/**
 * ⚠ `app.ts` PHẢI mount router này (`/api/internal/whiteboards`) TRƯỚC `globalLimiter` và `express.json()`/`sanitizeInput` (cùng lý do `/api/internal/documents`): lưu lượng collab → BE
 * (PUT mỗi vài giây/bảng đang vẽ) không được ăn hạn mức IP toàn cục, và body Yjs nhị phân không được qua bộ đọc JSON/sanitize. Không mount lần nữa trong `router.ts`.
 */
export default router;
