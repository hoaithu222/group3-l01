import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { JoinRequestService } from "../services/join-request.service";
import type { WorkspaceRoleValue } from "../entities/member.interface";
import type { CursorQuery } from "../../../shared/dto/common-schemas";
import type { JoinRequestDecisionDto } from "../dtos";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

function roleOf(req: Request): WorkspaceRoleValue {
  const role = req.access?.WORKSPACE?.role;
  if (!role) throw new Error("[members] Thiếu req.access.WORKSPACE — route quên gắn requireWorkspaceRole()");
  return role as WorkspaceRoleValue;
}

export function createJoinRequestController(service: JoinRequestService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as CursorQuery;
    const { data, nextCursor, hasMore } = await service.list(req.params.workspaceId, query);
    ResponseUtils.cursor(res, { data, meta: { nextCursor, hasMore, limit: query.limit } });
  });

  const approve = catchAsync(async (req: Request, res: Response) => {
    const row = await service.approve(requireUser(req).id, roleOf(req), req.params.workspaceId, req.params.userId);
    ResponseUtils.success(res, row, "Đã duyệt yêu cầu tham gia");
  });

  const reject = catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body as JoinRequestDecisionDto;
    const row = await service.reject(requireUser(req).id, roleOf(req), req.params.workspaceId, req.params.userId, reason);
    ResponseUtils.success(res, row, "Đã từ chối yêu cầu tham gia");
  });

  /** `204` — chính người đang chờ huỷ yêu cầu của mình. */
  const cancel = catchAsync(async (req: Request, res: Response) => {
    await service.cancel(requireUser(req).id, req.params.workspaceId);
    res.status(204).end();
  });

  return { list, approve, reject, cancel };
}
