import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { TalentSearchQuery } from "../dtos";
import type { TalentSearchService } from "../services/talent-search.service";
import { requireUser } from "./company.controller";

/** Tìm/xem ứng viên phía HR (be.md §4). Công ty APPROVED + nhân sự ACTIVE đã kiểm bởi `companyScope({ approved })`. */
export function createTalentController(talent: TalentSearchService) {
  const search = catchAsync(async (req: Request, res: Response) => {
    const page = await talent.search(req.params.companyId, req.query as unknown as TalentSearchQuery);
    ResponseUtils.cursor(res, page, "Ứng viên");
  });

  const profile = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await talent.profile(requireUser(req), req.params.companyId, req.params.userId), "Hồ sơ ứng viên");
  });

  const proof = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await talent.proof(requireUser(req), req.params.companyId, req.params.userId, req.params.skillId), "Minh chứng kỹ năng");
  });

  return { search, profile, proof };
}
