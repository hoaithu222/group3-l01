import "express";
import type { ScopeType, ResolvedAccess } from "../permission/scope.types";

declare global {
  namespace Express {
    /** User info gắn vào req sau khi authenticate (từ JWT payload hoặc load từ DB). */
    interface AuthUser {
      id: string;
      email: string;
      name?: string;
      role?: string;
      /** Quyền theo dữ liệu (recruiter:*, partner:* — Phase 5). Rỗng ở Phase 0. */
      permissions?: string[];
      /** Id `Session` của access token đang dùng (claim `sid`) — vắng ở token cũ hoặc khi không qua `verifyAccessContext`. */
      sessionId?: string;
    }

    interface Request {
      /** User đã xác thực (gắn bởi authenticateToken middleware) */
      user?: AuthUser;
      /** UUID duy nhất của request (gắn bởi requestId middleware) */
      requestId?: string;
      /** Kết quả `assert`/`resolve` gắn bởi `require*` (`core/permission/middlewares.ts`, p0-02). */
      access?: Partial<Record<ScopeType, ResolvedAccess>>;
    }
  }
}

/** Exported type alias — dùng khi import AuthUser tường mình */
export type AuthUser = Express.AuthUser;

/** Request có user (bắt buộc đã đăng nhập). */
export type AuthenticatedRequest = import("express").Request & {
  user: Express.AuthUser;
  requestId: string;
};
