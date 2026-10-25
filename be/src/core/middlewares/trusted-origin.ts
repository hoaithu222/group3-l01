import type { Request, Response, NextFunction } from "express";
import { getAllowedOrigins } from "../config";
import { ForbiddenError } from "../exceptions";

/** `null` = chưa tính; `true` = cho mọi origin (dev `ALLOWED_ORIGINS=*`); mảng = allowlist. */
let cachedOrigins: boolean | string[] | null = null;

function allowedOrigins(): boolean | string[] {
  cachedOrigins ??= getAllowedOrigins();
  return cachedOrigins;
}

/** Chỉ dùng trong test — xoá cache allowlist để đọc lại `ALLOWED_ORIGINS`. */
export function resetTrustedOriginCacheForTests(): void {
  cachedOrigins = null;
}

function isSameOrigin(origin: string, req: Request): boolean {
  try {
    return new URL(origin).host === req.get("host");
  } catch {
    return false;
  }
}

/**
 * Chống CSRF cho endpoint xác thực CHỈ bằng cookie (`POST /auth/refresh` với
 * cookie httpOnly `refresh_token`): trình duyệt luôn gửi header `Origin` trên
 * request cross-origin, nên `Origin` có mặt mà KHÔNG nằm trong `ALLOWED_ORIGINS`
 * (và không phải cùng origin với API) ⇒ 403. Cookie `SameSite=Strict` (production)
 * đã chặn CSRF khác-site; lớp này chặn thêm trường hợp cùng-site nhưng khác-origin
 * (subdomain bị XSS, cổng localhost khác ở dev, `SameSite=Lax`).
 *
 * Không có `Origin` (app di động gửi refresh token trong body, curl, gọi
 * server-to-server) ⇒ cho qua — không phải request trình duyệt cross-origin và
 * không có cookie nào để lợi dụng.
 */
export function requireTrustedOrigin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const origin = req.get("origin");
    if (!origin) {
      next();
      return;
    }
    const allowed = allowedOrigins();
    if (allowed === true || (Array.isArray(allowed) && allowed.includes(origin))) {
      next();
      return;
    }
    if (isSameOrigin(origin, req)) {
      next();
      return;
    }
    next(new ForbiddenError("Nguồn (Origin) của yêu cầu không được phép"));
  };
}
