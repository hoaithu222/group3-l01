import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { InvitationCreateService, InvitationActor } from "../services/invitation-create.service";
import type { InvitationAcceptService } from "../services/invitation-accept.service";
import type { WorkspaceRoleValue } from "../entities/member.interface";
import type { InviteGuestDto, InviteMembersDto, ListInvitationsQueryDto } from "../dtos";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

function actorOf(req: Request): InvitationActor {
  const role = req.access?.WORKSPACE?.role;
  if (!role) throw new Error("[members] Thiếu req.access.WORKSPACE — route quên gắn requireWorkspaceRole()");
  return { user: requireUser(req), role: role as WorkspaceRoleValue };
}

/** Lời mời đích danh theo email — be.md p3-04 §4. Token KHÔNG bao giờ có trong response (chỉ trong email). */
export function createInvitationController(create: InvitationCreateService, accept: InvitationAcceptService) {
  const inviteGuest = catchAsync(async (req: Request, res: Response) => {
    const invitation = await create.inviteGuest(actorOf(req), req.params.workspaceId, req.body as InviteGuestDto);
    ResponseUtils.success(res, invitation, "Đã gửi lời mời khách", 201);
  });

  const inviteMembers = catchAsync(async (req: Request, res: Response) => {
    const result = await create.inviteMembers(actorOf(req), req.params.workspaceId, req.body as InviteMembersDto);
    ResponseUtils.success(res, result, "Đã gửi lời mời", 201);
  });

  const list = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListInvitationsQueryDto;
    const { data, nextCursor, hasMore } = await create.list(req.params.workspaceId, query);
    ResponseUtils.cursor(res, { data, meta: { nextCursor, hasMore, limit: query.limit } });
  });

  const revoke = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await create.revoke(requireUser(req), req.params.invitationId), "Đã thu hồi lời mời");
  });

  const resend = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await create.resend(requireUser(req), req.params.invitationId), "Đã gửi lại lời mời");
  });

  const preview = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await accept.preview(req.params.token));
  });

  const acceptByToken = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await accept.accept(requireUser(req), req.params.token), "Đã tham gia nhóm");
  });

  const mine = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await accept.listMine(requireUser(req)));
  });

  const acceptMine = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await accept.acceptMine(requireUser(req), req.params.invitationId), "Đã tham gia nhóm");
  });

  return { inviteGuest, inviteMembers, list, revoke, resend, preview, acceptByToken, mine, acceptMine };
}
