import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, ScopeNotFoundError, UnauthorizedError } from "../../../core/exceptions";
import { permissionService } from "../../../core/permission";
import { roleHasPermission, type PermissionKey } from "../../../core/constants/permissions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { recruiterErrors } from "../services/recruiter.errors";

export interface CompanyScopeOptions {
  /** Chỉ OWNER (`company.manage`) — nhân sự khác → 403 `RECR_003`. */
  owner?: boolean;
  /** Công ty phải APPROVED (`company.talent`/`company.offer`) — PENDING/REJECTED/SUSPENDED → 403 `RECR_002`. */
  approved?: boolean;
  /** Tên tham số đường dẫn chứa `companyId` (mặc định `companyId`). */
  param?: string;
}

/**
 * `companyScope(opts)` (be.md §4): kiểm quyền theo resolver scope `COMPANY` — `companyId` LUÔN lấy từ đường dẫn và server luôn kiểm thành viên ACTIVE (không để header client quyết phạm vi, D-24 #8).
 * Không phải nhân sự (kể cả `admin`/`manager` vận hành — CR-44) → 404 trung tính; nhân sự nhưng thiếu quyền: `owner` → `RECR_003`, `approved` → `RECR_002`.
 * Chạy SAU `authenticateToken` + `validateParams` (companyId đã là ObjectId). Kết quả gắn `req.access.COMPANY` (role OWNER | RECRUITER).
 */
export function companyScope(opts: CompanyScopeOptions = {}) {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const id = req.params[opts.param ?? "companyId"];
    const access = await permissionService.resolve(req.user, { type: "COMPANY", id });
    if (!access.visible) throw new ScopeNotFoundError();
    if (opts.owner && !access.actions.has("company.manage")) throw recruiterErrors.ownerOnly();
    if (opts.approved && !access.actions.has("company.talent")) throw recruiterErrors.notApproved();
    req.access = { ...(req.access ?? {}), COMPANY: access };
    next();
  });
}

/**
 * Quyền VẬN HÀNH theo VAI HỆ THỐNG (`admin`/`manager`) — KHÔNG dùng `requirePermission`: nó chấp nhận cả quyền theo DỮ LIỆU (`recruiter:view|create|update` cấp cho nhân sự công ty APPROVED),
 * nên HR sẽ gọi được `/admin/companies*` (kể cả đổi gói/hạn mức công ty khác). Route admin của recruiter dùng hàm này.
 */
export function requireOpsPermission(key: PermissionKey) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError("Bạn cần đăng nhập"));
    if (roleHasPermission(req.user.role, key)) return next();
    next(new ForbiddenError("Bạn không có quyền thực hiện hành động này"));
  };
}
