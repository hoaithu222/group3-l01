import type { Request, Response } from "express";
import { ValidationError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { DocumentsContainer } from "../documents.container";

/** Header `X-Yjs-Version` (base version collab đang giữ) — số nguyên ≥ 0, thiếu/hỏng → 0 (coi như base cũ nhất → BE hợp nhất nếu cần). */
function baseVersionOf(req: Request): number {
  const n = Number(req.header("x-yjs-version"));
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** Controller cho `/api/internal/documents/*` — chỉ collab gọi (bí mật dùng chung). Phản hồi state là octet-stream, còn lại phong bì chuẩn. */
export function createInternalDocumentsController(c: DocumentsContainer) {
  const access = catchAsync(async (req: Request, res: Response) => {
    const { userId, sv } = req.query as unknown as { userId: string; sv: number };
    ResponseUtils.success(res, await c.collabService.access(req.params.id, userId, sv));
  });

  const getState = catchAsync(async (req: Request, res: Response) => {
    const { state, yjsVersion } = await c.collabService.getState(req.params.id);
    res.status(200);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Yjs-Version", String(yjsVersion));
    res.setHeader("Cache-Control", "no-store");
    res.end(Buffer.from(state));
  });

  const putState = catchAsync(async (req: Request, res: Response) => {
    // `express.raw` mount TRƯỚC `express.json` (routes file) → body là Buffer; không phải octet-stream/quá trần thì không có body.
    if (!Buffer.isBuffer(req.body)) throw new ValidationError("Body phải là application/octet-stream (Yjs update)");
    const editorId = req.header("x-last-editor") ?? undefined;
    ResponseUtils.success(res, await c.collabService.putState(req.params.id, new Uint8Array(req.body), baseVersionOf(req), editorId), "Đã lưu");
  });

  return { access, getState, putState };
}
