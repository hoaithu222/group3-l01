import { Router } from "express";
import { apiLimiter, authenticateToken, requireFeature, requireSystemConfig, scopeLimiter, validateBody, validateParams } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { FeatureDisabledError } from "../../core/exceptions";
import { createCompanyController } from "./controllers/company.controller";
import { addMemberSchema, companyMemberParamSchema, companyParamSchema, registerCompanySchema, updateCompanySchema } from "./dtos";
import { companyScope } from "./middlewares/company-scope.middleware";
import { getRecruiterContainer, type RecruiterContainer } from "./recruiter.container";

/** Cờ + công tắc cho mọi route người dùng/HR của recruiter: cờ `career` VÀ `recruiter.enabled` (mặc định TẮT) — tắt cái nào cũng 404 `CFG_005`. */
export const recruiterGuard = [authenticateToken, requireFeature(MODULES.CAREER), requireSystemConfig("recruiter.enabled", () => new FeatureDisabledError()), apiLimiter] as const;

const byUser = (req: { user?: { id: string } }) => req.user?.id ?? null;

/**
 * Doanh nghiệp + nhân sự (be.md §4). `companyId` luôn ở đường dẫn và luôn kiểm thành viên ACTIVE qua `companyScope` (resolver scope `COMPANY`).
 */
/**
 * @openapi
 * /companies:
 *   post:
 *     summary: "Đăng ký doanh nghiệp (PENDING) — người đăng ký là OWNER; RECR_001 đã thuộc doanh nghiệp, RECR_004 trùng tên/MST; 3 lần/ngày"
 *     tags: [Recruiter-Company]
 *     security: [{ BearerAuth: [] }]
 * /me/company:
 *   get:
 *     summary: "Doanh nghiệp của tôi { company, membership, permissions } hoặc 404"
 *     tags: [Recruiter-Company]
 *     security: [{ BearerAuth: [] }]
 * /companies/{companyId}:
 *   get:
 *     summary: "Hồ sơ doanh nghiệp + hạn mức tháng (nhân sự ACTIVE) — người ngoài 404"
 *     tags: [Recruiter-Company]
 *     security: [{ BearerAuth: [] }]
 *   patch:
 *     summary: "OWNER sửa hồ sơ (expectedVersion) — tên/MST/website khoá khi đã duyệt (RECR_009)"
 *     tags: [Recruiter-Company]
 *     security: [{ BearerAuth: [] }]
 * /companies/{companyId}/resubmit:
 *   post:
 *     summary: "OWNER gửi duyệt lại (REJECTED → PENDING)"
 *     tags: [Recruiter-Company]
 *     security: [{ BearerAuth: [] }]
 * /companies/{companyId}/members:
 *   get:
 *     summary: "Nhân sự ACTIVE"
 *     tags: [Recruiter-Company]
 *     security: [{ BearerAuth: [] }]
 *   post:
 *     summary: "OWNER thêm nhân sự theo email (công ty APPROVED) — RECR_011 đã thuộc doanh nghiệp khác"
 *     tags: [Recruiter-Company]
 *     security: [{ BearerAuth: [] }]
 * /companies/{companyId}/members/{userId}:
 *   delete:
 *     summary: "OWNER gỡ nhân sự — RECR_012 khi gỡ OWNER cuối cùng"
 *     tags: [Recruiter-Company]
 *     security: [{ BearerAuth: [] }]
 * /companies/{companyId}/usage:
 *   get:
 *     summary: "Hạn mức lời mời tháng { period, used, quota, remaining, tier }"
 *     tags: [Recruiter-Company]
 *     security: [{ BearerAuth: [] }]
 */
export function createCompaniesRouter(c: RecruiterContainer = getRecruiterContainer()): Router {
  const ctl = createCompanyController(c.services.companies, c.services.members);
  const router = Router();

  router.post(
    "/companies",
    ...recruiterGuard,
    validateBody(registerCompanySchema),
    // Sau validate: yêu cầu sai dạng không tốn hạn mức 3 lần/ngày.
    scopeLimiter("company-register", byUser, [{ max: LIMITS.company.registrationsPerUserPerDay, windowSeconds: 24 * 3600 }]),
    ctl.register
  );
  router.get("/me/company", ...recruiterGuard, ctl.mine);
  router.get("/companies/:companyId", ...recruiterGuard, validateParams(companyParamSchema), companyScope(), ctl.get);
  router.patch("/companies/:companyId", ...recruiterGuard, validateParams(companyParamSchema), companyScope({ owner: true }), validateBody(updateCompanySchema), ctl.update);
  router.post("/companies/:companyId/resubmit", ...recruiterGuard, validateParams(companyParamSchema), companyScope({ owner: true }), ctl.resubmit);
  router.get("/companies/:companyId/usage", ...recruiterGuard, validateParams(companyParamSchema), companyScope(), ctl.usage);
  router.get("/companies/:companyId/members", ...recruiterGuard, validateParams(companyParamSchema), companyScope(), ctl.listMembers);
  router.post("/companies/:companyId/members", ...recruiterGuard, validateParams(companyParamSchema), companyScope({ owner: true, approved: true }), validateBody(addMemberSchema), ctl.addMember);
  router.delete("/companies/:companyId/members/:userId", ...recruiterGuard, validateParams(companyMemberParamSchema), companyScope({ owner: true }), ctl.removeMember);
  return router;
}
