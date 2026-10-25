import express, { Router, type ErrorRequestHandler } from "express";
import { requireInternalSecret, validateParams, validateQuery } from "../../core/middlewares";
import { LIMITS } from "../../core/constants/limits";
import { AppError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";
import { getDocumentsContainer } from "./documents.container";
import { createInternalDocumentsController } from "./controllers/internal-documents.controller";
import { internalAccessQuerySchema, internalDocumentParamsSchema } from "./dtos";

/** Body PUT state: trần 6 MiB (state tối đa 5 MiB + dư). Vượt → 413 `DOC_006` (bộ đọc body báo `entity.too.large`, errorHandler toàn cục sẽ trả 500 nếu không map). */
export const INTERNAL_STATE_BODY = { type: "application/octet-stream", limit: LIMITS.document.stateMaxBytes + 1024 * 1024 } as const;

const controller = createInternalDocumentsController(getDocumentsContainer());
const router = Router();

// Bí mật kiểm TRƯỚC mọi thứ (kể cả đọc body) để người lạ không ép server đọc 6 MiB. KHÔNG `authenticateToken` (không có người dùng), KHÔNG `requireFeature`
// (tắt cờ giữa chừng không được làm collab mất dữ liệu đang gõ) — chỉ mạng nội bộ + bí mật.
router.use(requireInternalSecret("collab"));

// Cố ý KHÔNG có `@openapi` — endpoint nội bộ không nằm trong Swagger công khai. Hợp đồng: `collab/README.md` §4.1.
router.get("/:id/access", validateParams(internalDocumentParamsSchema), validateQuery(internalAccessQuerySchema), controller.access);
router.get("/:id/state", validateParams(internalDocumentParamsSchema), controller.getState);
router.put("/:id/state", validateParams(internalDocumentParamsSchema), express.raw(INTERNAL_STATE_BODY), controller.putState);

const tooLarge: ErrorRequestHandler = (err, _req, _res, next) => {
  if ((err as { type?: string } | null)?.type === "entity.too.large") {
    next(new AppError(ErrorMessages[ErrorCode.DOC_006], 413, ErrorCode.DOC_006, { maxBytes: LIMITS.document.stateMaxBytes }));
    return;
  }
  next(err);
};
router.use(tooLarge);

/**
 * ⚠ `app.ts` PHẢI mount router này (`/api/internal/documents`) TRƯỚC `globalLimiter` và `express.json()`/`sanitizeInput`: lưu lượng collab → BE (PUT mỗi vài giây/tài liệu đang sửa)
 * không được ăn hạn mức IP toàn cục, và body Yjs nhị phân không được qua bộ đọc JSON/sanitize. Không mount lần nữa trong `router.ts`.
 */
export default router;
