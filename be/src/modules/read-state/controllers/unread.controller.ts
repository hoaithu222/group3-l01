import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { UnreadService } from "../services/unread.service";
import type { UnreadQueryDto } from "../dtos";

export function createUnreadController(service: UnreadService) {
  const summary = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    ResponseUtils.success(res, await service.summary(req.user.id), "Tổng hợp chưa đọc");
  });

  const perWorkspace = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { workspaceId } = req.query as unknown as UnreadQueryDto;
    ResponseUtils.success(res, await service.perWorkspace(req.user.id, workspaceId), "Chưa đọc theo kênh và luồng");
  });

  return { summary, perWorkspace };
}
