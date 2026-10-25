import { Router } from "express";
import { validateParams, validateQuery, scopeLimiter } from "../../core/middlewares";
import { LIMITS } from "../../core/constants/limits";
import { ErrorCode } from "../../core/utils/error.codes";
import { recruiterGuard } from "./companies.routes";
import { createTalentController } from "./controllers/talent.controller";
import { companyParamSchema, talentProofParamSchema, talentSearchQuerySchema, talentUserParamSchema } from "./dtos";
import { companyScope } from "./middlewares/company-scope.middleware";
import { getRecruiterContainer, type RecruiterContainer } from "./recruiter.container";

const byUser = (req: { user?: { id: string } }) => req.user?.id ?? null;

/**
 * Tìm/xem ứng viên phía HR (be.md §4). CHỈ nhân sự công ty APPROVED (`companyScope({ approved })` → 404 người ngoài, 403 `RECR_002` công ty chưa duyệt/tạm ngưng). Mỗi lượt xem hồ sơ/minh chứng
 * tính vào trần 300/ngày/HR (`RECR_010`); mỗi lượt xem hồ sơ ghi `AuditLog talent.profile-view` + gộp `TalentProfileView`.
 */
/**
 * @openapi
 * /companies/{companyId}/talent/search:
 *   get:
 *     summary: "Tìm ứng viên đang Open to work (kỹ năng, đóng góp tối thiểu, số huy hiệu, vị trí, khu vực, từ khoá) — cursor; không email/SĐT/tên nhóm"
 *     tags: [Recruiter-Talent]
 *     security: [{ BearerAuth: [] }]
 * /companies/{companyId}/talent/{userId}:
 *   get:
 *     summary: "Hồ sơ ứng viên — 404 khi đã tắt Open to work/chặn công ty; RECR_010 quá 300 lượt/ngày; ghi nhật ký mỗi lượt xem"
 *     tags: [Recruiter-Talent]
 *     security: [{ BearerAuth: [] }]
 * /companies/{companyId}/talent/{userId}/skills/{skillId}/proof:
 *   get:
 *     summary: "Minh chứng huy hiệu kỹ năng lọc theo người xem (tiêu đề task ẩn trừ khi ứng viên bật proofTitles)"
 *     tags: [Recruiter-Talent]
 *     security: [{ BearerAuth: [] }]
 */
export function createTalentRouter(c: RecruiterContainer = getRecruiterContainer()): Router {
  const ctl = createTalentController(c.services.talentSearch);
  const viewLimit = scopeLimiter("talent-view", byUser, [{ max: LIMITS.talent.profileViewsPerDay, windowSeconds: 24 * 3600 }], ErrorCode.RECR_010);
  const router = Router();

  // `/talent/search` PHẢI đứng trước `/talent/:userId`.
  router.get("/companies/:companyId/talent/search", ...recruiterGuard, validateParams(companyParamSchema), companyScope({ approved: true }), validateQuery(talentSearchQuerySchema), ctl.search);
  router.get("/companies/:companyId/talent/:userId", ...recruiterGuard, validateParams(talentUserParamSchema), companyScope({ approved: true }), viewLimit, ctl.profile);
  router.get("/companies/:companyId/talent/:userId/skills/:skillId/proof", ...recruiterGuard, validateParams(talentProofParamSchema), companyScope({ approved: true }), viewLimit, ctl.proof);
  return router;
}
