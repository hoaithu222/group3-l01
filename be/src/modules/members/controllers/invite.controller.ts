import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { InviteService } from "../services/invite.service";
import type { AcceptInviteDto, CreateInviteDto } from "../dtos";
import type { CursorQuery } from "../../../shared/dto/common-schemas";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createInviteController(inviteService: InviteService) {
  const create = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await inviteService.create(user.id, req.params.workspaceId, req.body as CreateInviteDto);
    ResponseUtils.success(res, result, "Đã tạo lời mời", 201);
  });

  const list = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as CursorQuery;
    const { data, nextCursor, hasMore } = await inviteService.list(req.params.workspaceId, query.cursor, query.limit);
    ResponseUtils.cursor(res, { data, meta: { nextCursor, hasMore, limit: query.limit } });
  });

  const revoke = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    await inviteService.revoke(user.id, req.params.workspaceId, req.params.inviteId);
    ResponseUtils.success(res, null, "Đã thu hồi lời mời");
  });

  const preview = catchAsync(async (req: Request, res: Response) => {
    const result = await inviteService.preview(req.params.token, req.user?.id);
    ResponseUtils.success(res, result);
  });

  const accept = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { requestMessage } = req.body as AcceptInviteDto;
    const result = await inviteService.accept(user.id, req.params.token, requestMessage);
    // p3-04 (WS_017): nhóm bật duyệt → yêu cầu đang chờ, trả 202 trong `data.status` (KHÔNG phải lỗi).
    if (result.status === "PENDING") {
      ResponseUtils.success(res, result, "Yêu cầu tham gia đang chờ quản trị nhóm duyệt", 202);
      return;
    }
    ResponseUtils.success(res, result, "Đã tham gia nhóm");
  });

  return { create, list, revoke, preview, accept };
}
