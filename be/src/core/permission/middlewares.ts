import type { Request, Response, NextFunction } from "express";
import { catchAsync } from "../utils/catchAsync";
import { UnauthorizedError, ValidationError, ScopeNotFoundError, ScopeForbiddenError } from "../exceptions";
import { ErrorCode, ErrorMessages } from "../utils/error.codes";
import type { AuthUser } from "../types/express";
import type { ScopeType, ResolvedAccess } from "./scope.types";
import type { Action } from "./actions";
import { permissionService } from "./permission.service";

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

function readScopeId(req: Request, param: string): string {
  const id = req.params[param];
  if (typeof id !== "string" || !OBJECT_ID_RE.test(id)) {
    throw new ValidationError(`Tham số "${param}" không hợp lệ (phải là ObjectId 24 ký tự hex)`);
  }
  return id;
}

function requireUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

function attachAccess(req: Request, type: ScopeType, access: ResolvedAccess): void {
  req.access = { ...(req.access ?? {}), [type]: access };
}

/**
 * Middleware nền cho mọi `require*` khác — validate `req.params[param]` là
 * ObjectId, `assert(action)`, gắn kết quả vào `req.access[type]`.
 */
export function requireScope(type: ScopeType, param: string, action: Action) {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
    const id = readScopeId(req, param);
    const user = requireUser(req);
    const access = await permissionService.assert(user, action, { type, id });
    attachAccess(req, type, access);
    next();
  });
}

const WORKSPACE_ROLE_ORDER = ["GUEST", "MEMBER", "ADMIN", "OWNER"] as const;
export type WorkspaceRoleName = (typeof WORKSPACE_ROLE_ORDER)[number];

/**
 * be.md §4 — kiểm `visible` + thứ bậc vai trò workspace; thiếu bậc → 403
 * `PERM_001` (khác các `require*Role` khác vốn dùng `PERM_006` — quy định
 * tường minh trong bảng middleware be.md, không áp dụng chung §8).
 */
export function requireWorkspaceRole(min: WorkspaceRoleName, param = "workspaceId") {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
    const id = readScopeId(req, param);
    const user = requireUser(req);
    const access = await permissionService.resolve(user, { type: "WORKSPACE", id });
    if (!access.visible) throw new ScopeNotFoundError();

    const roleIdx = access.role ? WORKSPACE_ROLE_ORDER.indexOf(access.role as WorkspaceRoleName) : -1;
    const minIdx = WORKSPACE_ROLE_ORDER.indexOf(min);
    if (roleIdx < minIdx) {
      // p3-04 — khách không được biết chức năng vượt quyền mình tồn tại: 404 trung tính thay vì 403 (README §2/§6).
      if (access.role === "GUEST") throw new ScopeNotFoundError();
      throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
    }

    attachAccess(req, "WORKSPACE", access);
    next();
  });
}

const CHANNEL_ACTION_BY_LEVEL = {
  read: "channel.read",
  write: "channel.message.send",
  manage: "channel.manage",
} as const satisfies Record<string, Action>;
export type ChannelAccessLevel = keyof typeof CHANNEL_ACTION_BY_LEVEL;

export function requireChannelAccess(level: ChannelAccessLevel, param = "channelId") {
  return requireScope("CHANNEL", param, CHANNEL_ACTION_BY_LEVEL[level]);
}

export function requireConversationMember(param = "conversationId") {
  return requireScope("CONVERSATION", param, "conversation.read");
}

const CONVERSATION_ROLE_ORDER = ["MEMBER", "ADMIN", "OWNER"] as const;
export type ConversationRoleName = (typeof CONVERSATION_ROLE_ORDER)[number];

/**
 * Dùng `req.access.CONVERSATION` do `requireConversationMember()` gắn trước
 * đó (be.md §4: "dùng kết quả trên") — KHÔNG resolve lại. Thiếu bậc vai trò
 * → 403 `PERM_006` (be.md §8).
 */
export function requireConversationRole(min: ConversationRoleName) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const access = req.access?.CONVERSATION;
    if (!access) {
      next(
        new Error(
          "[permission] requireConversationRole phải chạy sau requireConversationMember() trong cùng route"
        )
      );
      return;
    }
    const roleIdx = access.role ? CONVERSATION_ROLE_ORDER.indexOf(access.role as ConversationRoleName) : -1;
    const minIdx = CONVERSATION_ROLE_ORDER.indexOf(min);
    if (roleIdx < minIdx) {
      next(new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_006], ErrorCode.PERM_006));
      return;
    }
    next();
  };
}

export function requireMeetingRole(action: Action, param = "meetingId") {
  return requireScope("MEETING", param, action);
}

export function requireCallParticipant(action: Action = "call.join", param = "callId") {
  return requireScope("CALL", param, action);
}
