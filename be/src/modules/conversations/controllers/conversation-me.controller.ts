import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { ConversationMeService } from "../services/conversation-me.service";
import type { ReadReceiptService } from "../services/read-receipt.service";
import type { ConversationMediaService } from "../services/conversation-media.service";
import type { MediaQueryDto, MeSettingsDto, ReadReceiptsQueryDto } from "../dtos";

function requireUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** be.md §1 — `conversation-me.controller.ts`: me settings/clear/read-receipts/media. */
export function createConversationMeController(
  meService: ConversationMeService,
  readReceiptService: ReadReceiptService,
  mediaService: ConversationMediaService
) {
  const updateMe = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await meService.updateMe(user, req.params.id, req.body as MeSettingsDto);
    ResponseUtils.success(res, result);
  });

  const clear = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await meService.clear(user, req.params.id);
    ResponseUtils.success(res, result, "Đã xoá phía tôi");
  });

  const readReceipts = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { seq } = req.query as unknown as ReadReceiptsQueryDto;
    const result = await readReceiptService.getReceipts(user, req.params.id, seq);
    ResponseUtils.success(res, result);
  });

  const media = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const query = req.query as unknown as MediaQueryDto;
    const { data, nextCursor } = await mediaService.list(user, req.params.id, query);
    ResponseUtils.cursor(res, { data, meta: { nextCursor, hasMore: nextCursor !== null, limit: query.limit } });
  });

  return { updateMe, clear, readReceipts, media };
}
