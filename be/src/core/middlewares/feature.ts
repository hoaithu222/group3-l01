/**
 * @file feature.ts
 * @description Middleware chặn route theo cấu hình runtime (p0-07 §5.2) —
 * bật/tắt phân hệ/cờ không cần restart, khác `requireRoles`/`requirePermission`
 * (chặn theo AI xác thực, không theo trạng thái tính năng).
 */
import type { Request, Response, NextFunction } from "express";
import { runtimeConfig } from "../config/runtime-config";
import { ForbiddenError, FeatureDisabledError, type AppError } from "../exceptions";
import type { ModuleId, SubFeatureId } from "../constants/modules";

/**
 * Chặn route của 1 phân hệ (`MODULES.*`) khi tắt runtime — 404 `CFG_005`.
 * Gắn TRỰC TIẾP ở route của module đó (KHÔNG mount có điều kiện lúc khởi
 * động) — `RuntimeConfigService.isFeatureEnabled()` đã gộp env ⊕ SystemConfig
 * ⊕ AVAILABLE_MODULES ⊕ AI_BLOCKED.
 */
export function requireFeature(m: ModuleId) {
  return async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const enabled = await runtimeConfig.isFeatureEnabled(m);
    if (!enabled) return next(new FeatureDisabledError());
    next();
  };
}

/**
 * Chặn route của một tiện ích theo cờ PHỤ (`SUB_FEATURES.*`, p5-04) — 404 `CFG_005` khi tắt (cờ phụ tắt HOẶC phân hệ cha tắt).
 * Gắn cùng chỗ với `requireFeature` của phân hệ cha.
 */
export function requireSubFeature(id: SubFeatureId) {
  return async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const enabled = await runtimeConfig.isSubFeatureEnabled(id);
    if (!enabled) return next(new FeatureDisabledError());
    next();
  };
}

/**
 * Chặn route bằng 1 khoá boolean tuỳ ý trong `SystemConfig`, dạng
 * `"<registryKey>.<subPath>"` (vd `"auth.biometricLogin.enabled"`) — khác
 * `requireFeature` (chỉ áp cho module toggle trong khoá `features`).
 *
 * `value !== false` coi như CHO QUA (mặc định registry đa số là `true`, và
 * path sai/khoá lạ trả `undefined` cũng không nên chặn nhầm route) — chỉ
 * chặn khi runtime XÁC NHẬN rõ ràng là tắt.
 *
 * `makeError` cho phép trả mã lỗi nghiệp vụ cụ thể (vd `AUTH_016` ở
 * `/auth/biometric/login`) thay vì `ForbiddenError` (`AUTH_005`) mặc định.
 */
export function requireSystemConfig(path: string, makeError: () => AppError = () => new ForbiddenError()) {
  return async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const value = await runtimeConfig.get(path);
    if (value === false) return next(makeError());
    next();
  };
}
