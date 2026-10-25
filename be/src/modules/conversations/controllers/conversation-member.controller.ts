import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { ConversationMemberService } from "../services/conversation-member.service";
import type { AddMembersDto, ChangeRoleDto, ListMembersQueryDto, TransferOwnerDto } from "../dtos";

function requireUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** be.md §1 — `conversation-member.controller.ts`: members/add/role/remove/transfer/leave. */
export function createConversationMemberController(memberService: ConversationMemberService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const query = req.query as unknown as ListMembersQueryDto;
    const { data, nextCursor } = await memberService.list(user, req.params.id, query);
    ResponseUtils.cursor(res, { data, meta: { nextCursor, hasMore: nextCursor !== null, limit: query.limit } });
  });

  const add = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await memberService.add(user, req.params.id, req.body as AddMembersDto);
    ResponseUtils.success(res, result, "Đã thêm thành viên");
  });

  const changeRole = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await memberService.changeRole(user, req.params.id, req.params.userId, req.body as ChangeRoleDto);
    ResponseUtils.success(res, result, "Đã đổi vai trò");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await memberService.remove(user, req.params.id, req.params.userId);
    ResponseUtils.success(res, result, "Đã xoá thành viên");
  });

  const transfer = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { toUserId } = req.body as TransferOwnerDto;
    const detail = await memberService.transfer(user, req.params.id, toUserId);
    ResponseUtils.success(res, detail, "Đã chuyển quyền chủ nhóm");
  });

  const leave = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await memberService.leave(user, req.params.id);
    ResponseUtils.success(res, result, "Đã rời cuộc trò chuyện");
  });

  return { list, add, changeRole, remove, transfer, leave };
}
