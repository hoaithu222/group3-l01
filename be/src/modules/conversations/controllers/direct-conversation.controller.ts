import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { DirectConversationService } from "../services/direct-conversation.service";
import type { CreateDirectDto } from "../dtos";

function requireUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** be.md §1 — `direct-conversation.controller.ts`: get/create DIRECT. */
export function createDirectConversationController(directService: DirectConversationService) {
  const get = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const detail = await directService.getDetailForPeer(user, req.params.userId);
    ResponseUtils.success(res, detail);
  });

  const create = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { userId } = req.body as CreateDirectDto;
    const { created, detail } = await directService.getOrCreateDirect(user, userId);
    ResponseUtils.success(res, detail, created ? "Đã tạo hội thoại" : "Hội thoại đã tồn tại", created ? 201 : 200);
  });

  return { get, create };
}
