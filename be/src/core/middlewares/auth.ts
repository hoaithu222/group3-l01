import type { Response, NextFunction } from "express";
import type { Request } from "express";
import { JwtUtils } from "../utils/jwt";
import { UnauthorizedError, ForbiddenError, AppError } from "../exceptions";
import { logger } from "../../infrastructure/logger";
import { verifyAccessContext } from "../permission/access-context";
import { roleHasPermission, type PermissionKey } from "../constants/permissions";
import { hasDataPermissionProviderFor, resolveDataPermissions } from "../permission/data-permissions";

/**
 * Middleware xác thực JWT: bắt buộc có Authorization: Bearer <token> hợp lệ.
 * Uỷ quyền toàn bộ logic kiểm tra (blacklist, trạng thái tài khoản,
 * sessionVersion) cho `verifyAccessContext` — dùng chung với Socket.IO
 * `io.use` để hai kênh không bao giờ lệch nhau.
 */
export async function authenticateToken(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = JwtUtils.extractTokenFromHeader(authHeader);
    const { user } = await verifyAccessContext(token);
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    logger.error("Authentication error:", err);
    next(new UnauthorizedError("Token không hợp lệ hoặc đã hết hạn"));
  }
}

/**
 * Middleware xác thực tùy chọn: có Bearer token hợp lệ thì gắn `req.user`,
 * không có / không hợp lệ thì đi tiếp như khách (không ném lỗi).
 *
 * "Hợp lệ" = ĐÚNG như `authenticateToken` (`verifyAccessContext`): chữ ký,
 * blacklist, phiên đã thu hồi, trạng thái tài khoản, `sessionVersion`. Trước
 * đây chỉ kiểm chữ ký + blacklist nên tài khoản đã khoá/xoá hoặc phiên đã bị
 * thu hồi (đổi mật khẩu…) vẫn được coi là người dùng đã đăng nhập tới khi
 * token hết hạn.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.headers.authorization) {
      next();
      return;
    }
    const token = JwtUtils.extractTokenFromHeader(req.headers.authorization);
    const { user } = await verifyAccessContext(token);
    req.user = user;
  } catch {
    // Token sai/hết hạn/bị thu hồi → coi như khách (optional nên không throw).
  }
  next();
}

/**
 * Middleware kiểm tra role: chỉ cho phép nếu req.user có role nằm trong danh sách.
 * Gắn sau authenticateToken.
 */
export function requireRoles(allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError("Bạn cần đăng nhập"));
      return;
    }
    const role = req.user.role;
    if (!role || !allowedRoles.includes(role)) {
      next(new ForbiddenError("Bạn không có quyền truy cập"));
      return;
    }
    next();
  };
}

/**
 * Yêu cầu quyền cụ thể — hợp nhất quyền theo role (`ROLE_PERMISSIONS`) và
 * quyền theo dữ liệu (`req.user.permissions`, vd `partner:*` — p6-05, `recruiter:*`).
 * Quyền theo dữ liệu tra LƯỜI (`resolveDataPermissions`, cache 60 s) chỉ khi vai hệ thống
 * không có `key` VÀ có provider cho tài nguyên của `key` — route khác không tốn truy vấn.
 */
export function requirePermission(key: PermissionKey) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      next(new UnauthorizedError("Bạn cần đăng nhập"));
      return;
    }
    const dataPerms = user.permissions ?? [];
    if (roleHasPermission(user.role, key) || dataPerms.includes(key)) {
      next();
      return;
    }
    if (!hasDataPermissionProviderFor(key)) {
      next(new ForbiddenError("Bạn không có quyền thực hiện hành động này"));
      return;
    }
    resolveDataPermissions(user.id).then((extra) => {
      user.permissions = [...new Set([...dataPerms, ...extra])];
      next(extra.includes(key) ? undefined : new ForbiddenError("Bạn không có quyền thực hiện hành động này"));
    }, next);
  };
}

/**
 * Cho phép chính chủ (req.params[param] === req.user.id) HOẶC người có quyền `key`.
 * Dùng cho các endpoint self-service (xem/sửa hồ sơ của chính mình, phiên đăng nhập...).
 */
export function requireSelfOrPermission(param: string, key: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError("Bạn cần đăng nhập"));
      return;
    }
    if (req.params[param] === req.user.id) {
      next();
      return;
    }
    requirePermission(key)(req, res, next);
  };
}
