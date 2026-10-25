import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import { permissionService, type Action, type ScopeType } from "../../../core/permission";
import type { NotificationService } from "../services/notification.service";
import type { NotificationPreferenceService } from "../services/notification-preference.service";
import type { WorkspacePreferenceDto } from "../dtos/account-preference.dto";
import type { ListNotificationsQuery, ReadAllDto, UnreadCountQuery } from "../dtos/list-notifications.dto";
import { isLegacyPreferenceBody, type GetPreferenceQuery, type PreferenceBody } from "../dtos/preference.dto";

/** `PreferenceScope` "WORKSPACE"/"CHANNEL"/"CONVERSATION" khớp tên `ScopeType` — action đọc tương ứng. */
const READ_ACTION_BY_SCOPE: Partial<Record<string, Action>> = {
  WORKSPACE: "workspace.read",
  CHANNEL: "channel.read",
  CONVERSATION: "conversation.read",
};

export function createNotificationController(service: NotificationService, prefService: NotificationPreferenceService) {
  const listInbox = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const q = req.query as unknown as ListNotificationsQuery;
    const result = await service.listInbox(req.user.id, {
      filter: q.filter,
      workspaceId: q.workspaceId,
      unreadOnly: q.unreadOnly,
      cursor: q.cursor,
      limit: q.limit,
    });
    ResponseUtils.cursor(res, result, "Danh sách thông báo");
  });

  const unreadCount = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const q = req.query as unknown as UnreadCountQuery;
    const result = await service.unreadCount(req.user.id, q.workspaceId);
    ResponseUtils.success(res, result, "Số thông báo chưa đọc");
  });

  const markRead = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const readAt = await service.markRead(req.user.id, req.params.id);
    ResponseUtils.success(res, { id: req.params.id, readAt }, "Đã đánh dấu đã đọc");
  });

  const markAllRead = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { filter, workspaceId, before } = req.body as ReadAllDto;
    const updated = await service.markAllRead(req.user.id, { filter, workspaceId, before: new Date(before) });
    ResponseUtils.success(res, { updated }, "Đã đánh dấu tất cả đã đọc");
  });

  const getPreference = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const q = req.query as unknown as GetPreferenceQuery;
    // p1-07: không `scope` (hoặc ACCOUNT) → view cấp tài khoản đã điền mặc định; scope khác → dạng cũ p0-06.
    if (!q.scope || q.scope === "ACCOUNT") {
      ResponseUtils.success(res, await prefService.getAccount(req.user.id), "Tuỳ chọn thông báo");
      return;
    }
    const pref = await service.getPreference(req.user.id, q.scope, q.scopeId);
    ResponseUtils.success(res, pref, "Tuỳ chọn thông báo");
  });

  const updatePreference = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const raw = req.body as PreferenceBody;
    if (!isLegacyPreferenceBody(raw)) {
      ResponseUtils.success(res, await prefService.putAccount(req.user.id, raw), "Đã cập nhật tuỳ chọn thông báo");
      return;
    }
    const body = raw;

    // be.md §4 — scope ≠ ACCOUNT bắt buộc còn quyền đọc scope đó.
    const readAction = READ_ACTION_BY_SCOPE[body.scope];
    if (readAction && body.scopeId) {
      await permissionService.assert(req.user, readAction, { type: body.scope as ScopeType, id: body.scopeId });
    }

    const pref = await service.setPreference({
      userId: req.user.id,
      scope: body.scope,
      scopeId: body.scopeId,
      mode: body.mode,
      mutedUntil: body.mutedUntil === undefined ? undefined : body.mutedUntil ? new Date(body.mutedUntil) : null,
      dndUntil: body.dndUntil === undefined ? undefined : body.dndUntil ? new Date(body.dndUntil) : null,
      lockScreenPreview: body.lockScreenPreview,
    });
    ResponseUtils.success(res, pref, "Đã cập nhật tuỳ chọn thông báo");
  });

  const getWorkspacePreference = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    ResponseUtils.success(res, await prefService.getWorkspace(req.user.id, req.params.id), "Tuỳ chọn thông báo của nhóm làm việc");
  });

  const updateWorkspacePreference = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const body = req.body as WorkspacePreferenceDto;
    const view = await prefService.putWorkspace(req.user.id, req.params.id, body);
    ResponseUtils.success(res, view, "Đã cập nhật tuỳ chọn thông báo của nhóm làm việc");
  });

  return {
    listInbox,
    unreadCount,
    markRead,
    markAllRead,
    getPreference,
    updatePreference,
    getWorkspacePreference,
    updateWorkspacePreference,
  };
}
