import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { ResolvedAccess } from "../../../core/permission";
import type { MemberQueryService } from "../services/member-query.service";
import type { MembershipLifecycleService } from "../services/membership-lifecycle.service";
import type { WorkspaceRoleValue, ListMembersParams } from "../entities/member.interface";
import type { ListMembersQueryDto, PatchMemberDto, ModerateMemberDto } from "../dtos";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

function requireWorkspaceAccess(req: Request): ResolvedAccess {
  const access = req.access?.WORKSPACE;
  if (!access) {
    throw new Error("[members] Thiếu req.access.WORKSPACE — route quên gắn requireWorkspaceRole()");
  }
  return access;
}

function paginationMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) || 1, hasNext: page * limit < total, hasPrev: page > 1 };
}

export function createMemberController(
  queryService: MemberQueryService,
  lifecycleService: MembershipLifecycleService
) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const access = requireWorkspaceAccess(req);
    const query = req.query as unknown as ListMembersQueryDto;
    const params: ListMembersParams = { ...query };
    const { data, total } = await queryService.list(user.id, access.role as WorkspaceRoleValue, req.params.workspaceId, params);
    ResponseUtils.paginated(res, { data, meta: paginationMeta(query.page, query.limit, total) });
  });

  const getCard = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const access = requireWorkspaceAccess(req);
    const card = await queryService.getCard(user.id, access.role as WorkspaceRoleValue, req.params.workspaceId, req.params.userId);
    ResponseUtils.success(res, card);
  });

  const patch = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const access = requireWorkspaceAccess(req);
    const dto = req.body as PatchMemberDto;
    const { workspaceId, userId: targetUserId } = req.params;

    if (dto.role !== undefined) {
      await lifecycleService.changeRole(user.id, workspaceId, targetUserId, dto.role);
    }
    if (dto.displayName !== undefined) {
      await lifecycleService.updateDisplayName(user.id, workspaceId, targetUserId, dto.displayName);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { actions, ...row } = await queryService.getCard(
      user.id,
      access.role as WorkspaceRoleValue,
      workspaceId,
      targetUserId
    );
    ResponseUtils.success(res, row, "Cập nhật thành công");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { reason } = req.body as ModerateMemberDto;
    await lifecycleService.revoke(user.id, req.params.workspaceId, req.params.userId, "REMOVED", reason);
    ResponseUtils.success(res, null, "Đã loại thành viên");
  });

  const ban = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { reason } = req.body as ModerateMemberDto;
    await lifecycleService.revoke(user.id, req.params.workspaceId, req.params.userId, "BANNED", reason);
    ResponseUtils.success(res, null, "Đã chặn thành viên");
  });

  const unban = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { reason } = req.body as ModerateMemberDto;
    await lifecycleService.unban(user.id, req.params.workspaceId, req.params.userId, reason);
    ResponseUtils.success(res, null, "Đã bỏ chặn thành viên");
  });

  return { list, getCard, patch, remove, ban, unban };
}
