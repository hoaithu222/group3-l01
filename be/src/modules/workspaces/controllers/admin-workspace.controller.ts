import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AdminWorkspaceQueryService } from "../services/admin-workspace-query.service";
import type { AdminWorkspaceImageService } from "../services/admin-workspace-image.service";
import type { WorkspaceLifecycleService } from "../services/workspace-lifecycle.service";
import type { AdminListWorkspacesQueryDto, AdminArchiveDto, AdminStatsQueryDto, AdminRemoveImageDto } from "../dtos";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createAdminWorkspaceController(
  queryService: AdminWorkspaceQueryService,
  lifecycleService: WorkspaceLifecycleService,
  imageService: AdminWorkspaceImageService
) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as AdminListWorkspacesQueryDto;
    const { data, total } = await queryService.list(query);
    const { page, limit } = query;
    ResponseUtils.paginated(res, {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    });
  });

  const getDetail = catchAsync(async (req: Request, res: Response) => {
    const detail = await queryService.getDetail(req.params.workspaceId);
    ResponseUtils.success(res, detail);
  });

  const getStats = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as AdminStatsQueryDto;
    const stats = await queryService.getStats(req.params.workspaceId, query.range);
    ResponseUtils.success(res, stats);
  });

  const archive = catchAsync(async (req: Request, res: Response) => {
    const admin = requireUser(req);
    const { reason } = req.body as AdminArchiveDto;
    const workspace = await lifecycleService.platformArchive(admin.id, req.params.workspaceId, reason);
    ResponseUtils.success(res, workspace, "Đã ghi nhật ký lưu trữ nhóm");
  });

  const restore = catchAsync(async (req: Request, res: Response) => {
    const admin = requireUser(req);
    const { reason } = req.body as AdminArchiveDto;
    const workspace = await lifecycleService.platformRestore(admin.id, req.params.workspaceId, reason);
    ResponseUtils.success(res, workspace, "Đã ghi nhật ký khôi phục nhóm");
  });

  const removeImage = catchAsync(async (req: Request, res: Response) => {
    const admin = requireUser(req);
    const result = await imageService.remove(admin.id, req.params.workspaceId, req.body as AdminRemoveImageDto);
    ResponseUtils.success(res, result, result.removed ? "Đã gỡ ảnh của nhóm" : "Nhóm không có ảnh này");
  });

  return { list, getDetail, getStats, archive, restore, removeImage };
}
