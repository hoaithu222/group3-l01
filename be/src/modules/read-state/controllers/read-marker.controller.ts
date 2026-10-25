import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { ReadMarkerService } from "../services/read-marker.service";
import type { ReadAllConversationsDto, ReadMarkerDto } from "../dtos";

export function createReadMarkerController(service: ReadMarkerService) {
  const mark = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const result = await service.mark(req.user, req.body as ReadMarkerDto);
    ResponseUtils.success(res, result, "Đã cập nhật mốc đọc");
  });

  const readAllConversations = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { before } = req.body as ReadAllConversationsDto;
    const result = await service.readAllConversations(req.user, new Date(before));
    ResponseUtils.success(res, result, "Đã đánh dấu đã đọc các cuộc trò chuyện");
  });

  return { mark, readAllConversations };
}
