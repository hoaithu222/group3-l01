import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { ForbiddenError, UnauthorizedError } from "../../../core/exceptions";
import type { ChannelGrantService } from "../services/channel-grant.service";
import type { ChannelRoleGrantService } from "../services/channel-role-grant.service";
import type { AddGrantsDto, PatchGrantDto, RoleGrantDto, RoleRefParamDto } from "../dtos";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createChannelGrantController(grantService: ChannelGrantService, roleGrantService: ChannelRoleGrantService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const rows = await grantService.listGrants(req.params.channelId);
    ResponseUtils.success(res, rows);
  });

  const add = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await grantService.add(user.id, req.params.channelId, req.body as AddGrantsDto);
    ResponseUtils.success(res, result, "Đã thêm quyền truy cập", 201);
  });

  const patch = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { level } = req.body as PatchGrantDto;
    const row = await grantService.patchLevel(user.id, req.params.channelId, req.params.userId, level);
    ResponseUtils.success(res, row, "Cập nhật thành công");
  });

  /**
   * be.md §4 — `requireChannelAccess("manage")` HOẶC chính chủ (không thể
   * biểu diễn bằng 1 middleware `require*` sẵn có, giống
   * `requireSelfOrPermission` nhưng theo scope kênh) — kiểm ở đây, route chỉ
   * gắn `requireChannelAccess("read")`.
   */
  const remove = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const access = req.access?.CHANNEL;
    const isSelf = req.params.userId === user.id;
    const canManageGrants = access?.actions.has("channel.grant.manage") ?? false;
    if (!isSelf && !canManageGrants) throw new ForbiddenError();

    await grantService.revoke(user.id, req.params.channelId, req.params.userId);
    ResponseUtils.success(res, null, "Đã thu hồi quyền truy cập");
  });

  // ── p3-04: cấp quyền theo vai trò + quyền hiệu lực ────────────────────────
  const addRole = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { roleRef } = req.body as RoleGrantDto;
    const row = await roleGrantService.add(user.id, req.params.channelId, roleRef);
    ResponseUtils.success(res, row, "Đã cấp quyền theo vai trò", 201);
  });

  const removeRole = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { roleRef } = req.params as unknown as RoleRefParamDto;
    await roleGrantService.remove(user.id, req.params.channelId, roleRef);
    ResponseUtils.success(res, null, "Đã gỡ quyền theo vai trò");
  });

  const access = catchAsync(async (req: Request, res: Response) => {
    const result = await roleGrantService.effectiveAccess(req.params.channelId, req.params.userId);
    ResponseUtils.success(res, result);
  });

  return { list, add, patch, remove, addRole, removeRole, access };
}
