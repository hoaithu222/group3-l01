import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { CreateReportDto, MessageReportDto, MyReportsQueryDto } from "../dtos";
import type { ReportService } from "../services/report.service";

function requireUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** `POST /reports`, `POST /messages/:messageId/report`, `GET /me/reports` (be.md p1-08 §4). */
export function createReportController(service: ReportService) {
  const respondCreated = (res: Response, result: Awaited<ReturnType<ReportService["create"]>>): void => {
    // Lần 2 (idempotent) trả 200 + bản cũ; lần đầu 201.
    ResponseUtils.success(
      res,
      { id: result.id, status: result.status, createdAt: result.createdAt, alreadyReported: result.alreadyReported },
      result.alreadyReported ? "Bạn đã báo cáo nội dung này" : "Đã gửi báo cáo",
      result.alreadyReported ? 200 : 201
    );
  };

  const create = catchAsync(async (req: Request, res: Response) => {
    respondCreated(res, await service.create(requireUser(req), req.body as CreateReportDto));
  });

  const createForMessage = catchAsync(async (req: Request, res: Response) => {
    const body = req.body as MessageReportDto;
    respondCreated(res, await service.create(requireUser(req), { targetType: "MESSAGE", targetId: req.params.messageId, ...body }));
  });

  const myReports = catchAsync(async (req: Request, res: Response) => {
    const result = await service.myReports(requireUser(req).id, req.query as unknown as MyReportsQueryDto);
    ResponseUtils.cursor(res, result, "Danh sách báo cáo của tôi");
  });

  return { create, createForMessage, myReports };
}
