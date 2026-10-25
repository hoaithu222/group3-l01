import { Router } from "express";
import { apiLimiter, authenticateToken, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { createAdminRecruiterController } from "./controllers/admin-recruiter.controller";
import { adminCompaniesQuerySchema, adminCompanyActionSchema, adminCompanyParamSchema, adminCompanyPatchSchema, offerParamSchema, statsQuerySchema } from "./dtos";
import { requireOpsPermission } from "./middlewares/company-scope.middleware";
import { getRecruiterContainer, type RecruiterContainer } from "./recruiter.container";

/**
 * Vận hành recruiter (be.md §4). Path tuyệt đối, mount ở root v1. KHÔNG gắn cờ `career`/`recruiter.enabled`: vận hành phải duyệt/tạm ngưng/xử lý báo cáo kể cả khi bảng tin đang tắt.
 * ⚠ Quyền theo VAI HỆ THỐNG (`requireOpsPermission` → `roleHasPermission`), KHÔNG `requirePermission`: nhân sự công ty APPROVED có `recruiter:view|create|update` theo DỮ LIỆU và sẽ lọt vào
 * API vận hành (đổi gói/hạn mức công ty khác). `manager` có `recruiter:view|approve`; `recruiter:update` chỉ `admin`.
 */
/**
 * @openapi
 * /admin/companies:
 *   get:
 *     summary: "Danh sách doanh nghiệp (page, limit, q, status, tier) + membersCount, offersThisMonth, quota, reportedCount"
 *     tags: [Admin-Recruiter]
 *     security: [{ BearerAuth: [] }]
 * /admin/companies/{companyId}:
 *   get:
 *     summary: "Chi tiết: hồ sơ, emailDomain, nhân sự, sử dụng 6 tháng, số lời mời theo trạng thái (không nội dung)"
 *     tags: [Admin-Recruiter]
 *     security: [{ BearerAuth: [] }]
 *   patch:
 *     summary: "Đổi gói/hạn mức/tên/website/MST (recruiter:update, lý do + expectedVersion)"
 *     tags: [Admin-Recruiter]
 *     security: [{ BearerAuth: [] }]
 * /admin/companies/{companyId}/approve:
 *   post:
 *     summary: "Duyệt (PENDING sang APPROVED) — lý do bắt buộc, RECR_009 sai trạng thái"
 *     tags: [Admin-Recruiter]
 *     security: [{ BearerAuth: [] }]
 * /admin/companies/{companyId}/reject:
 *   post:
 *     summary: "Từ chối (PENDING sang REJECTED, nhả khoá tên/MST)"
 *     tags: [Admin-Recruiter]
 *     security: [{ BearerAuth: [] }]
 * /admin/companies/{companyId}/suspend:
 *   post:
 *     summary: "Tạm ngưng (APPROVED sang SUSPENDED) — HR mất quyền tìm/gửi ngay, lời mời mở thành chỉ đọc, đóng báo cáo mở"
 *     tags: [Admin-Recruiter]
 *     security: [{ BearerAuth: [] }]
 * /admin/companies/{companyId}/reinstate:
 *   post:
 *     summary: "Khôi phục (SUSPENDED sang APPROVED)"
 *     tags: [Admin-Recruiter]
 *     security: [{ BearerAuth: [] }]
 * /admin/recruiter/stats:
 *   get:
 *     summary: "Thống kê theo tháng, top công ty, số công ty chạm hạn mức, số ứng viên Open to work (from, to ≤ 366 ngày, tz)"
 *     tags: [Admin-Recruiter]
 *     security: [{ BearerAuth: [] }]
 * /admin/job-offers/{offerId}/reported:
 *   get:
 *     summary: "Nội dung lời mời bị báo cáo (chỉ khi có báo cáo; không thread, không người nhận) — ghi nhật ký"
 *     tags: [Admin-Recruiter]
 *     security: [{ BearerAuth: [] }]
 * /admin/job-offers/{offerId}/withdraw:
 *   post:
 *     summary: "Thu hồi lời mời vi phạm (đã có báo cáo) + đóng báo cáo mở"
 *     tags: [Admin-Recruiter]
 *     security: [{ BearerAuth: [] }]
 */
export function createAdminRecruiterRouter(c: RecruiterContainer = getRecruiterContainer()): Router {
  const ctl = createAdminRecruiterController(c.services.admin, c.services.stats, c.services.moderation);
  const base = [authenticateToken, apiLimiter] as const;
  const params = validateParams(adminCompanyParamSchema);
  const router = Router();

  router.get("/admin/companies", ...base, requireOpsPermission("recruiter:view"), validateQuery(adminCompaniesQuerySchema), ctl.list);
  router.get("/admin/companies/:companyId", ...base, requireOpsPermission("recruiter:view"), params, ctl.detail);
  for (const action of ["approve", "reject", "suspend", "reinstate"] as const) {
    router.post(`/admin/companies/:companyId/${action}`, ...base, requireOpsPermission("recruiter:approve"), params, validateBody(adminCompanyActionSchema), ctl.act(action));
  }
  router.patch("/admin/companies/:companyId", ...base, requireOpsPermission("recruiter:update"), params, validateBody(adminCompanyPatchSchema), ctl.patch);
  router.get("/admin/recruiter/stats", ...base, requireOpsPermission("recruiter:view"), validateQuery(statsQuerySchema), ctl.getStats);
  router.get("/admin/job-offers/:offerId/reported", ...base, requireOpsPermission("recruiter:approve"), validateParams(offerParamSchema), ctl.reportedOffer);
  router.post("/admin/job-offers/:offerId/withdraw", ...base, requireOpsPermission("recruiter:approve"), validateParams(offerParamSchema), validateBody(adminCompanyActionSchema), ctl.withdrawOffer);
  return router;
}

export default createAdminRecruiterRouter();
