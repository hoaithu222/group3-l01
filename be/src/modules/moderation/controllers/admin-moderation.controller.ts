import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { AdminActionDto, AdminListReportsQueryDto, AdminRemoveMessageDto } from "../dtos";
import type { PlatformModerationService } from "../services/platform-moderation.service";

function requireUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** `/admin/reports*`, `/admin/messages/:messageId/remove` (be.md p1-08 §4). */
export function createAdminModerationController(service: PlatformModerationService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as AdminListReportsQueryDto;
    const { data, total } = await service.list(query);
    const meta = {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit) || 1,
      hasNext: query.page * query.limit < total,
      hasPrev: query.page > 1,
    };
    ResponseUtils.paginated(res, { data, meta }, "Hàng đợi kiểm duyệt");
  });

  const detail = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.detail(req.params.reportId));
  });

  const content = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.content(requireUser(req), req.params.reportId), "Nội dung báo cáo (đã ghi nhật ký)");
  });

  const act = catchAsync(async (req: Request, res: Response) => {
    const result = await service.act(requireUser(req), req.params.reportId, req.body as AdminActionDto);
    ResponseUtils.success(res, result, "Đã xử lý báo cáo");
  });

  const removeMessage = catchAsync(async (req: Request, res: Response) => {
    const result = await service.removeMessage(requireUser(req), req.params.messageId, req.body as AdminRemoveMessageDto);
    ResponseUtils.success(res, result, "Đã gỡ tin nhắn");
  });

  return { list, detail, content, act, removeMessage };
}
