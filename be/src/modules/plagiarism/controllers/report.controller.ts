import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { SectionsQueryDto } from "../dtos/scan.dto";
import type { ReportService } from "../services/report.service";

export function createReportController(d: { reports: ReportService }) {
  const report = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.reports.report(req.params.scanId));
  });

  const sections = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as SectionsQueryDto;
    ResponseUtils.cursor(
      res,
      await d.reports.sections({ scanId: req.params.scanId, targetResourceId: req.params.resourceId, ...query }),
      "Đoạn trùng"
    );
  });

  const context = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.reports.context(req.params.scanId, req.params.sectionId));
  });

  return { report, sections, context };
}
