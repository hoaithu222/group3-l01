import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CareerVisibilityDto } from "../dtos";
import type { CareerProfileService } from "../services/career-profile.service";
import type { SkillQueryService } from "../services/skill-query.service";

export function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** Huy hiệu kỹ năng + hồ sơ nghề nghiệp phía NGƯỜI DÙNG (be.md §4). Không có handler tạo huy hiệu (CR-03). */
export function createCareerController(query: SkillQueryService, profile: CareerProfileService) {
  const catalog = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await query.catalog(requireUser(req).id), "Danh mục kỹ năng");
  });

  const detail = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await query.detail(requireUser(req).id, req.params.id), "Kỹ năng");
  });

  const myBadges = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await query.myBadges(requireUser(req).id), "Huy hiệu kỹ năng của tôi");
  });

  const userBadges = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await query.userBadges(requireUser(req), req.params.id), "Huy hiệu kỹ năng");
  });

  const proof = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await query.proof(requireUser(req), req.params.id, req.params.skillId), "Minh chứng kỹ năng");
  });

  const myCareer = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await profile.get(requireUser(req).id), "Hồ sơ nghề nghiệp");
  });

  const updateVisibility = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await profile.updateVisibility(requireUser(req).id, req.body as CareerVisibilityDto), "Đã cập nhật quyền riêng tư");
  });

  return { catalog, detail, myBadges, userBadges, proof, myCareer, updateVisibility };
}
