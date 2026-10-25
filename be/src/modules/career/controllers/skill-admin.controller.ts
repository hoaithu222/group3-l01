import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AdminSkillsQueryDto, CreateSkillDto, EligiblePreviewQueryDto, SkillReasonDto, UpdateSkillDto } from "../dtos";
import type { SkillBadgeAdminService } from "../services/skill-badge-admin.service";
import type { SkillDefinitionsService } from "../services/skill-definitions.service";
import type { SkillPreviewService } from "../services/skill-preview.service";
import type { SkillQueryService } from "../services/skill-query.service";
import { requireUser } from "./career.controller";

export interface SkillAdminControllerDeps {
  admin: SkillDefinitionsService;
  preview: SkillPreviewService;
  badgeAdmin: SkillBadgeAdminService;
  query: SkillQueryService;
}

/** Quản trị kỹ năng (`skill:view|create|update`, admin.md p6-06). Mọi thao tác ghi có audit (ghi ở service); thu hồi/khôi phục/bật tắt cần `reason`. */
export function createSkillAdminController(s: SkillAdminControllerDeps) {
  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.paginated(res, await s.admin.list(req.query as unknown as AdminSkillsQueryDto), "Danh sách kỹ năng");
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.admin.get(req.params.id), "Kỹ năng");
  });

  const create = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.admin.create(requireUser(req), req.body as CreateSkillDto), "Đã tạo kỹ năng", 201);
  });

  const update = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.admin.update(requireUser(req), req.params.id, req.body as UpdateSkillDto), "Đã cập nhật kỹ năng");
  });

  const activate = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.admin.setActive(requireUser(req), req.params.id, true, (req.body as SkillReasonDto).reason), "Đã bật kỹ năng");
  });

  const deactivate = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.admin.setActive(requireUser(req), req.params.id, false, (req.body as SkillReasonDto).reason), "Đã tắt kỹ năng");
  });

  const preview = catchAsync(async (req: Request, res: Response) => {
    const { criteria } = req.query as unknown as EligiblePreviewQueryDto;
    ResponseUtils.success(res, await s.preview.eligible(req.params.id, criteria), "Xem trước người đủ điều kiện");
  });

  const labelSuggestions = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.preview.labelSuggestions(String(req.query.q ?? "")), "Gợi ý nhãn");
  });

  const reevaluate = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.badgeAdmin.reevaluateAll(requireUser(req), (req.body as SkillReasonDto).reason), "Đã xếp đánh giá lại", 202);
  });

  const userSkills = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.badgeAdmin.userSkills(req.params.id), "Kỹ năng của người dùng");
  });

  const userProof = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await s.query.adminProof(req.params.id, req.params.skillId), "Minh chứng kỹ năng");
  });

  const revoke = catchAsync(async (req: Request, res: Response) => {
    const { id, skillId } = req.params;
    ResponseUtils.success(res, await s.badgeAdmin.revoke(requireUser(req), id, skillId, (req.body as SkillReasonDto).reason), "Đã thu hồi huy hiệu");
  });

  const restore = catchAsync(async (req: Request, res: Response) => {
    const { id, skillId } = req.params;
    ResponseUtils.success(res, await s.badgeAdmin.restore(requireUser(req), id, skillId, (req.body as SkillReasonDto).reason), "Đã khôi phục huy hiệu");
  });

  return { list, get, create, update, activate, deactivate, preview, labelSuggestions, reevaluate, userSkills, userProof, revoke, restore };
}
