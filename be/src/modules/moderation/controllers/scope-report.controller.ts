import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { ListScopeReportsQueryDto, ResolveReportDto } from "../dtos";
import type { ScopeModerationService } from "../services/scope-moderation.service";

function requireUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** Hàng đợi + xử lý báo cáo theo phạm vi (be.md p1-08 §4) — response KHÔNG có `reporterId` (MOD-08). */
export function createScopeReportController(service: ScopeModerationService) {
  const listForWorkspace = catchAsync(async (req: Request, res: Response) => {
    const result = await service.listForWorkspace(requireUser(req), req.params.workspaceId, req.query as unknown as ListScopeReportsQueryDto);
    ResponseUtils.cursor(res, result, "Hàng đợi báo cáo");
  });

  const listForConversation = catchAsync(async (req: Request, res: Response) => {
    const result = await service.listForConversation(requireUser(req), req.params.conversationId, req.query as unknown as ListScopeReportsQueryDto);
    ResponseUtils.cursor(res, result, "Hàng đợi báo cáo");
  });

  const getDetail = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.getDetail(requireUser(req), req.params.reportId));
  });

  const resolve = catchAsync(async (req: Request, res: Response) => {
    const result = await service.resolve(requireUser(req), req.params.reportId, req.body as ResolveReportDto);
    ResponseUtils.success(res, result, "Đã xử lý báo cáo");
  });

  return { listForWorkspace, listForConversation, getDetail, resolve };
}
