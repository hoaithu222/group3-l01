import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { ResolvedAccess } from "../../../core/permission";
import type { WorkspaceService } from "../services/workspace.service";
import type { WorkspaceLifecycleService } from "../services/workspace-lifecycle.service";
import type { WorkspaceOverviewService } from "../services/workspace-overview.service";
import type { WorkspaceRoleValue } from "../entities/workspace.interface";
import type {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceMeDto,
  ListWorkspacesQueryDto,
  ArchiveWorkspaceDto,
  RestoreWorkspaceDto,
  TransferOwnerDto,
  WorkspaceSettingsDto,
} from "../dtos";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

function requireWorkspaceAccess(req: Request): ResolvedAccess {
  const access = req.access?.WORKSPACE;
  if (!access) {
    throw new Error("[workspaces] Thiếu req.access.WORKSPACE — route quên gắn requireWorkspaceRole()");
  }
  return access;
}

export function createWorkspaceController(
  workspaceService: WorkspaceService,
  lifecycleService: WorkspaceLifecycleService,
  overviewService: WorkspaceOverviewService
) {
  const create = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await workspaceService.create(user.id, req.body as CreateWorkspaceDto);
    ResponseUtils.success(res, result, "Tạo nhóm thành công", 201);
  });

  const list = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const query = req.query as unknown as ListWorkspacesQueryDto;
    const items = await workspaceService.list(user.id, query.status);
    ResponseUtils.success(res, items);
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const access = requireWorkspaceAccess(req);
    const detail = await workspaceService.get(req.params.workspaceId, user.id, access);
    ResponseUtils.success(res, detail);
  });

  const overview = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const access = requireWorkspaceAccess(req);
    const result = await overviewService.get({
      userId: user.id,
      workspaceId: req.params.workspaceId,
      access,
      role: access.role as WorkspaceRoleValue,
    });
    ResponseUtils.success(res, result);
  });

  const patch = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const access = requireWorkspaceAccess(req);
    const detail = await workspaceService.patch(user.id, req.params.workspaceId, req.body as UpdateWorkspaceDto, access);
    ResponseUtils.success(res, detail, "Cập nhật thành công");
  });

  const updateSettings = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await workspaceService.updateSettings(user.id, req.params.workspaceId, req.body as WorkspaceSettingsDto);
    ResponseUtils.success(res, result, "Cập nhật thiết lập nhóm thành công");
  });

  const updateMe = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await workspaceService.updateMe(req.params.workspaceId, user.id, req.body as WorkspaceMeDto);
    ResponseUtils.success(res, result);
  });

  const archive = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const access = requireWorkspaceAccess(req);
    const detail = await lifecycleService.archive(
      user.id,
      req.params.workspaceId,
      req.body as ArchiveWorkspaceDto,
      access.role as WorkspaceRoleValue
    );
    ResponseUtils.success(res, detail, "Đã lưu trữ nhóm");
  });

  const restore = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const access = requireWorkspaceAccess(req);
    const detail = await lifecycleService.restore(
      user.id,
      req.params.workspaceId,
      req.body as RestoreWorkspaceDto,
      access.role as WorkspaceRoleValue
    );
    ResponseUtils.success(res, detail, "Đã khôi phục nhóm");
  });

  const transferOwner = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await lifecycleService.transferOwner(user.id, req.params.workspaceId, req.body as TransferOwnerDto);
    ResponseUtils.success(res, result, "Đã chuyển quyền sở hữu");
  });

  const leave = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const access = requireWorkspaceAccess(req);
    await lifecycleService.leave(user.id, req.params.workspaceId, access.role as WorkspaceRoleValue);
    ResponseUtils.success(res, null, "Đã rời nhóm");
  });

  return { create, list, get, overview, patch, updateSettings, updateMe, archive, restore, transferOwner, leave };
}
