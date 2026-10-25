import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import { roleHasPermission } from "../../../core/constants/permissions";
import type { IMembershipRepository } from "../repositories/membership.repository.interface";
import type { MembershipLifecycleService } from "../services/membership-lifecycle.service";
import { toAdminMemberRow } from "../services/member.presenter";
import type { AdminListMembersParams } from "../entities/member.interface";
import type { AdminListMembersQueryDto, AdminRevokeMemberDto } from "../dtos";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

function paginationMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) || 1, hasNext: page * limit < total, hasPrev: page > 1 };
}

export function createAdminMemberController(
  repo: IMembershipRepository,
  lifecycleService: MembershipLifecycleService
) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const query = req.query as unknown as AdminListMembersQueryDto;
    const params: AdminListMembersParams = { ...query };
    const { data, total } = await repo.adminListMembers(req.params.workspaceId, params);
    const includeEmail = roleHasPermission(user.role, "user:view");
    const rows = data.map((row) => toAdminMemberRow(row, includeEmail));
    ResponseUtils.paginated(res, { data: rows, meta: paginationMeta(query.page, query.limit, total) });
  });

  const revoke = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { reason, ban } = req.body as AdminRevokeMemberDto;
    await lifecycleService.platformRevoke(user.id, req.params.workspaceId, req.params.userId, reason, ban);
    ResponseUtils.success(res, null, "Đã xử lý thành viên");
  });

  return { list, revoke };
}
