import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AdminConfigDto, AdminOverviewQueryDto, AdminReindexDto } from "../dtos/admin.dto";
import type { AdminPlagiarismService } from "../services/admin-plagiarism.service";
import type { PlagiarismConfigService } from "../services/plagiarism-config.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createAdminPlagiarismController(d: { admin: AdminPlagiarismService; config: PlagiarismConfigService }) {
  const overview = catchAsync(async (req: Request, res: Response) => {
    const { range } = req.query as unknown as AdminOverviewQueryDto;
    ResponseUtils.success(res, await d.admin.overview(range));
  });

  const getConfig = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, await d.config.getForAdmin());
  });

  const putConfig = catchAsync(async (req: Request, res: Response) => {
    const body = req.body as AdminConfigDto;
    const user = requireUser(req);
    const dto = await d.config.update(body, { id: user.id, role: user.role });
    ResponseUtils.success(res, dto, "Đã lưu cấu hình");
  });

  const reindex = catchAsync(async (req: Request, res: Response) => {
    const body = req.body as AdminReindexDto;
    const user = requireUser(req);
    const queued = await d.admin.reindex(body, { id: user.id, role: user.role });
    ResponseUtils.success(res, { queued }, "Đã xếp hàng lập chỉ mục lại", 202);
  });

  return { overview, getConfig, putConfig, reindex };
}
