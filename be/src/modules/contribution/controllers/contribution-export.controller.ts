import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CreateExportDto } from "../dtos";
import type { ContributionExportService } from "../services/export/contribution-export.service";

const actor = (req: Request) => req.user!;

export function createContributionExportController(exports: ContributionExportService) {
  /** `202` khi đã xếp job (hoặc đang tạo), `200` khi trả lại bản `READY` cùng dữ liệu. */
  const create = catchAsync(async (req: Request, res: Response) => {
    const result = await exports.request(actor(req), req.params.id, req.body as CreateExportDto);
    ResponseUtils.success(res, result.data, result.status === 200 ? "Báo cáo đã sẵn sàng" : "Đang tạo báo cáo", result.status);
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    const download = (req.query as { download?: boolean }).download === true;
    ResponseUtils.success(res, await exports.get(actor(req), req.params.id, { download }), "Báo cáo đã xuất");
  });

  return { create, get };
}
