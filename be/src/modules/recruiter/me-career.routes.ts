import { Router } from "express";
import { apiLimiter, authenticateToken, requireFeature, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { recruiterGuard } from "./companies.routes";
import { createStudentController } from "./controllers/offers.controller";
import { blockCompanySchema, blockedCompanyParamSchema, careerSettingsSchema, profileViewsQuerySchema } from "./dtos";
import { getRecruiterContainer, type RecruiterContainer } from "./recruiter.container";

/**
 * Hồ sơ tìm việc + chặn doanh nghiệp + lượt xem hồ sơ của SINH VIÊN (be.md §4). `PUT /me/career` và `GET /me/career/job-settings` chỉ cần cờ `career` (không cần `recruiter.enabled`) để sinh viên
 * luôn TẮT được Open to work và app biết `recruiterEnabled`/`requiredConsentVersion`; BẬT Open to work khi bảng tin đang tắt → 404 `CFG_005` (service). Các route còn lại cần cả `recruiter.enabled`.
 */
/**
 * @openapi
 * /me/career:
 *   put:
 *     summary: "Bật/tắt Open to work + tiêu đề, vị trí, khu vực — bật cần consentVersion khớp chính sách hiện hành (VAL_001); tắt xoá bản chiếu tìm kiếm ngay"
 *     tags: [Me-Career]
 *     security: [{ BearerAuth: [] }]
 * /me/career/job-settings:
 *   get:
 *     summary: "Cài đặt tìm việc { openToWork, headline, preferredRoles, location, consentVersion, requiredConsentVersion, recruiterEnabled, visibility }"
 *     tags: [Me-Career]
 *     security: [{ BearerAuth: [] }]
 * /me/company-blocks:
 *   get:
 *     summary: "Doanh nghiệp đã chặn"
 *     tags: [Me-Career]
 *     security: [{ BearerAuth: [] }]
 *   post:
 *     summary: "Chặn doanh nghiệp { companyId } — biến mất khỏi tìm kiếm, không gửi được lời mời, thread cũ chỉ đọc"
 *     tags: [Me-Career]
 *     security: [{ BearerAuth: [] }]
 * /me/company-blocks/{companyId}:
 *   delete:
 *     summary: "Bỏ chặn doanh nghiệp (không mở lại thread cũ)"
 *     tags: [Me-Career]
 *     security: [{ BearerAuth: [] }]
 * /me/profile-views:
 *   get:
 *     summary: "Doanh nghiệp đã xem hồ sơ của tôi (cursor; theo ngày, không lộ danh tính HR)"
 *     tags: [Me-Career]
 *     security: [{ BearerAuth: [] }]
 */
export function createMeCareerRouter(c: RecruiterContainer = getRecruiterContainer()): Router {
  const s = c.services;
  const ctl = createStudentController(s.studentOffers, s.messages, s.careerSettings, s.blocks);
  const careerGuard = [authenticateToken, requireFeature(MODULES.CAREER), apiLimiter] as const;
  const router = Router();

  router.put("/me/career", ...careerGuard, validateBody(careerSettingsSchema), ctl.putCareer);
  router.get("/me/career/job-settings", ...careerGuard, ctl.getCareer);

  router.get("/me/company-blocks", ...recruiterGuard, ctl.listBlocks);
  router.post("/me/company-blocks", ...recruiterGuard, validateBody(blockCompanySchema), ctl.block);
  router.delete("/me/company-blocks/:companyId", ...recruiterGuard, validateParams(blockedCompanyParamSchema), ctl.unblock);
  router.get("/me/profile-views", ...recruiterGuard, validateQuery(profileViewsQuerySchema), ctl.profileViews);
  return router;
}
