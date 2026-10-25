import type { NextFunction, Request, Response } from "express";
import { env } from "../../core/config";
import { roleHasPermission } from "../../core/constants/permissions";
import { FeatureDisabledError, ForbiddenError } from "../../core/exceptions";

/** Endpoint spike CHỈ tồn tại khi `NODE_ENV≠production` VÀ `MEDIA_SPIKE_ENABLED=true` — kiểm cả lúc chạy (không chỉ lúc mount). */
export function isSpikeEnabled(): boolean {
  return env.NODE_ENV !== "production" && env.MEDIA_SPIKE_ENABLED;
}

/** Email cho phép (env `MEDIA_SPIKE_ALLOWED_EMAILS`, phân tách dấu phẩy, không phân biệt hoa thường). */
export function spikeAllowedEmails(): Set<string> {
  return new Set(
    (env.MEDIA_SPIKE_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Tắt → 404 như route không tồn tại (`CFG_005`-style, không lộ có endpoint). */
export function requireSpikeEnabled(_req: Request, _res: Response, next: NextFunction): void {
  next(isSpikeEnabled() ? undefined : new FeatureDisabledError());
}

/** README §6: người có `system-config:update` hoặc email nằm trong allowlist. */
export function requireSpikeAccess(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user;
  const allowed =
    !!user && (roleHasPermission(user.role, "system-config:update") || spikeAllowedEmails().has(user.email.toLowerCase()));
  next(allowed ? undefined : new ForbiddenError("Bạn không có quyền dùng phòng spike"));
}
