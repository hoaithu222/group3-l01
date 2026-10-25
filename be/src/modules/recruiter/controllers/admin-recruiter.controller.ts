import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AdminCompaniesQuery, AdminCompanyPatchDto, StatsQuery } from "../dtos";
import type { CompanyAdminService } from "../services/company-admin.service";
import type { OfferModerationService } from "../services/offer-moderation.service";
import type { RecruiterStatsService } from "../services/recruiter-stats.service";
import { requireUser } from "./company.controller";

type Action = "approve" | "reject" | "suspend" | "reinstate";
const DONE: Record<Action, string> = { approve: "Đã duyệt doanh nghiệp", reject: "Đã từ chối doanh nghiệp", suspend: "Đã tạm ngưng doanh nghiệp", reinstate: "Đã khôi phục doanh nghiệp" };

/** Vận hành doanh nghiệp/lời mời bị báo cáo/thống kê (`/admin/*`) — quyền theo VAI HỆ THỐNG đã kiểm ở route (`requireOpsPermission`). */
export function createAdminRecruiterController(admin: CompanyAdminService, stats: RecruiterStatsService, moderation: OfferModerationService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const q = req.query as unknown as AdminCompaniesQuery;
    const { data, total } = await admin.list(q);
    const totalPages = Math.ceil(total / q.limit);
    ResponseUtils.paginated(res, { data, meta: { page: q.page, limit: q.limit, total, totalPages, hasNext: q.page < totalPages, hasPrev: q.page > 1 } }, "Doanh nghiệp");
  });

  const detail = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await admin.detail(requireUser(req), req.params.companyId), "Chi tiết doanh nghiệp");
  });

  const act = (action: Action) =>
    catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await admin.act(requireUser(req), req.params.companyId, action, (req.body as { reason: string }).reason), DONE[action]);
    });

  const patch = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await admin.patch(requireUser(req), req.params.companyId, req.body as AdminCompanyPatchDto), "Đã cập nhật doanh nghiệp");
  });

  const getStats = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await stats.stats(req.query as unknown as StatsQuery), "Thống kê tuyển dụng");
  });

  const reportedOffer = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await moderation.view(requireUser(req), req.params.offerId), "Lời mời bị báo cáo");
  });

  const withdrawOffer = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await moderation.withdraw(requireUser(req), req.params.offerId, (req.body as { reason: string }).reason), "Đã thu hồi lời mời vi phạm");
  });

  return { list, detail, act, patch, getStats, reportedOffer, withdrawOffer };
}
