import type { NextFunction, Request, Response } from "express";
import { permissionService } from "../../../core/permission";
import { AppError, ScopeForbiddenError, ScopeNotFoundError, UnauthorizedError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { catchAsync } from "../../../core/utils/catchAsync";
import type { AuthUser } from "../../../core/types/express";
import type { IWalletDirectory, WalletMemberRole } from "../repositories/wallet-directory.interface";

const ADMIN_ROLES: ReadonlySet<WalletMemberRole> = new Set(["OWNER", "ADMIN"]);

export function isWalletAdmin(role: WalletMemberRole): boolean {
  return ADMIN_ROLES.has(role);
}

/**
 * Ví là dữ liệu tài chính nội bộ: chỉ MEMBER+ (GUEST/người ngoài → 404 trung tính, IR-36).
 * `min: "ADMIN"` thêm bậc OWNER/ADMIN (cài đặt ví, nhắc ngay). Trả vai trò để caller quyết `canManage`.
 */
export async function assertWalletRole(
  user: AuthUser,
  workspaceId: string,
  min: "MEMBER" | "ADMIN" = "MEMBER"
): Promise<WalletMemberRole> {
  const access = await permissionService.resolve(user, { type: "WORKSPACE", id: workspaceId });
  const role = access.role as WalletMemberRole | null;
  if (!access.visible || !role || role === "GUEST") throw new ScopeNotFoundError();
  if (min === "ADMIN" && !isWalletAdmin(role)) {
    throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
  }
  return role;
}

/** Nhóm đã lưu trữ chỉ còn đọc — chặn mọi thao tác ghi tiền (README p1-01 §2 "Archive ảnh hưởng module khác"). */
export async function assertWorkspaceWritable(directory: IWalletDirectory, workspaceId: string): Promise<void> {
  if (!(await directory.isWorkspaceActive(workspaceId))) {
    throw new AppError(ErrorMessages[ErrorCode.WS_002], 403, ErrorCode.WS_002);
  }
}

/**
 * Chặn theo vai trò TRƯỚC các middleware tốn hạn mức (`scopeLimiter`): nếu limiter chạy trước, một MEMBER gọi
 * endpoint ADMIN (bị 403) vẫn tiêu hết hạn mức chung của nhóm và khoá luôn ADMIN thật.
 */
export function requireWalletRole(min: "MEMBER" | "ADMIN" = "MEMBER", param = "workspaceId") {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    await assertWalletRole(req.user, req.params[param], min);
    next();
  });
}
