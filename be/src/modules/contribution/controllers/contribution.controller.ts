import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { ContributionQueryDto, MemberTasksQueryDto } from "../dtos";
import type { ContributionMemberTasksService } from "../services/contribution-member-tasks.service";
import type { ContributionService } from "../services/contribution.service";

const actor = (req: Request) => req.user!;

/** Chỉ ĐỌC — mọi phương thức ghi tới `/boards/:id/contribution*` bị `methodNotAllowed(["GET"])` chặn ở route (`405 CONTRIB_001`). */
export function createContributionController(reports: ContributionService, memberTasksService: ContributionMemberTasksService) {
  const report = catchAsync(async (req: Request, res: Response) => {
    const { period } = req.query as unknown as ContributionQueryDto;
    ResponseUtils.success(res, await reports.getReport(actor(req), req.params.id, period), "Báo cáo đóng góp");
  });

  const periods = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await reports.getPeriods(actor(req), req.params.id), "Các kỳ có dữ liệu");
  });

  const memberTasks = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as MemberTasksQueryDto;
    const page = await memberTasksService.list(actor(req), req.params.id, req.params.userId, query);
    ResponseUtils.cursor(res, { data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.nextCursor !== null, limit: page.limit } }, "Thẻ được tính");
  });

  return { report, periods, memberTasks };
}
