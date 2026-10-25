import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AdminAccessService } from "../services/admin-access.service";
import type { AdminListInvitationsQueryDto } from "../dtos";

function paginationMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) || 1, hasNext: page * limit < total, hasPrev: page > 1 };
}

/** `GET /admin/workspaces/:id/access-summary` và `/invitations` — chỉ ĐỌC (admin không mời/duyệt thay chủ nhóm). */
export function createAdminAccessController(service: AdminAccessService) {
  const summary = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await service.summary(req.params.workspaceId));
  });

  const invitations = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as AdminListInvitationsQueryDto;
    const { data, total } = await service.listInvitations(req.params.workspaceId, query);
    ResponseUtils.paginated(res, { data, meta: paginationMeta(query.page, query.limit, total) });
  });

  return { summary, invitations };
}
