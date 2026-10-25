import type { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { UnauthorizedError, ScopeNotFoundError, ScopeForbiddenError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import { getMessageScope } from "../scope/message-scope.registry";
import type { MessageScopeTypeValue } from "../entities/message.interface";

function requireUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/**
 * be.md §4 (cuối bảng endpoint) — middleware THẬT (không có tham số option
 * ảo, mục 1 "critical facts"): đọc `scopeType/scopeId` từ `req.params`
 * (route `/scopes/:scopeType/:scopeId/messages` hoặc alias đã gắn sẵn bởi
 * `createScopedMessageRouter`), tra `registry.get(scopeType)`:
 *   - Không có adapter đăng ký (CONVERSATION chưa build — mục 3 báo cáo)
 *     HOẶC `!visible` → 404 trung tính (`PERM_404`).
 *   - `visible=true` nhưng thiếu quyền ghi (`action="write"`) → 403 `MSG_004`.
 */
export function requireMessageScope(action: "read" | "write") {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
    const scopeType = req.params.scopeType as MessageScopeTypeValue;
    const scopeId = req.params.scopeId;
    const user = requireUser(req);

    const scope = getMessageScope(scopeType);
    if (!scope) throw new ScopeNotFoundError();

    if (action === "read") {
      const access = await scope.canRead(user, scopeId);
      if (!access.visible) throw new ScopeNotFoundError();
    } else {
      const access = await scope.canWrite(user, scopeId);
      if (!access.visible) throw new ScopeNotFoundError();
      if (!access.allowed) throw new ScopeForbiddenError(ErrorMessages[ErrorCode.MSG_004], ErrorCode.MSG_004);
    }

    next();
  });
}
