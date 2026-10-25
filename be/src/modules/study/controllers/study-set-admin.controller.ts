import type { Request, Response } from "express";
import type { z } from "zod";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { reasonSchema } from "../../../shared/dto/common-schemas";
import type { AdminItemsQueryDto, AdminReportedSetsQueryDto } from "../dtos";
import type { StudyAdminOverviewService } from "../services/study-admin-overview.service";
import type { StudySetModerationService } from "../services/study-set-moderation.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createStudySetAdminController(moderation: StudySetModerationService, overview: StudyAdminOverviewService) {
  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await moderation.adminGet(req.params.id));
  });

  const items = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.paginated(res, await moderation.adminItems(req.params.id, req.query as unknown as AdminItemsQueryDto));
  });

  const hide = catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body as z.infer<typeof reasonSchema>;
    ResponseUtils.success(res, await moderation.adminHide(requireUser(req), req.params.id, reason), "Đã ẩn bộ học");
  });

  const restore = catchAsync(async (req: Request, res: Response) => {
    const { reason } = req.body as z.infer<typeof reasonSchema>;
    ResponseUtils.success(res, await moderation.adminRestore(requireUser(req), req.params.id, reason), "Đã khôi phục bộ học");
  });

  const listReported = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.paginated(res, await overview.listReported(req.query as unknown as AdminReportedSetsQueryDto));
  });

  const userSummary = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await overview.userSummary(req.params.id));
  });

  return { get, items, hide, restore, listReported, userSummary };
}
