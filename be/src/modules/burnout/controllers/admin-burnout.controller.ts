import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { OverviewQueryDto, UpdateRulesDto } from "../dtos";
import type { BurnoutAdminService } from "../services/burnout-admin.service";

/**
 * `/admin/wellbeing/*` — số liệu ẨN DANH tổng hợp + cấu hình luật. Không có route/handler nào nhận hay trả `userId`: admin không bao giờ thấy dữ liệu sức khoẻ của một cá nhân (test khoá điều này).
 */
export function createAdminBurnoutController(d: { admin: BurnoutAdminService }) {
  const overview = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.admin.overview((req.query as unknown as OverviewQueryDto).weeks), "Tổng quan ẩn danh");
  });

  const getRules = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, await d.admin.rules(), "Luật chấm điểm");
  });

  const putRules = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { expectedVersion, reason, ...ruleSet } = req.body as UpdateRulesDto;
    ResponseUtils.success(res, await d.admin.updateRules({ expectedVersion, reason, ...ruleSet }, { id: req.user.id, role: req.user.role }), "Đã cập nhật luật");
  });

  return { overview, getRules, putRules };
}
