import { Router } from "express";
import { authenticateToken, requireFeature, requirePermission, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createSkillAdminController } from "./controllers/skill-admin.controller";
import {
  adminSkillsQuerySchema,
  createSkillSchema,
  eligiblePreviewQuerySchema,
  labelSuggestionsQuerySchema,
  skillReasonSchema,
  updateSkillSchema,
  userSkillParamSchema,
} from "./dtos";
import { getCareerContainer, type CareerContainer } from "./career.container";

/**
 * Admin kỹ năng (admin.md p6-06) — mount ở root v1 (path tuyệt đối `/admin/*`). `skill:view` xem, `skill:create` tạo, `skill:update` sửa/bật-tắt/thu hồi/
 * khôi phục/đánh giá lại (manager có `skill:view|update`). Audit `skill.create|update|activate|deactivate|revoke|restore|reevaluate`. Không có route CẤP tay.
 */
export function createCareerAdminRouter(c: CareerContainer = getCareerContainer()): Router {
  const ctl = createSkillAdminController({ admin: c.admin, preview: c.preview, badgeAdmin: c.badgeAdmin, query: c.query });
  const guard = [authenticateToken, requireFeature(MODULES.CAREER)];
  const view = requirePermission("skill:view");
  const create = requirePermission("skill:create");
  const update = requirePermission("skill:update");
  const byId = validateParams(idParamSchema);
  const router = Router();

  /**
   * @openapi
   * /admin/skills:
   *   get:
   *     summary: Danh sách kỹ năng (lọc q/category/active, phân trang) kèm holdersCount
   *     tags: [Admin/Skills]
   *     security: [{ BearerAuth: [] }]
   *   post:
   *     summary: Tạo kỹ năng (luôn TẮT). SKILL_001 mã trùng, SKILL_002 tiêu chí sai, SKILL_005 vượt số kỹ năng tối đa
   *     tags: [Admin/Skills]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/admin/skills", ...guard, view, validateQuery(adminSkillsQuerySchema), ctl.list);
  router.post("/admin/skills", ...guard, create, validateBody(createSkillSchema), ctl.create);

  /**
   * @openapi
   * /admin/skills/label-suggestions:
   *   get:
   *     summary: Nhãn phổ biến (tên + số lần dùng, dạng chuẩn hoá) để gợi ý labelMatch
   *     tags: [Admin/Skills]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/admin/skills/label-suggestions", ...guard, view, validateQuery(labelSuggestionsQuerySchema), ctl.labelSuggestions);

  /**
   * @openapi
   * /admin/skills/reevaluate:
   *   post:
   *     summary: Đánh giá lại toàn bộ kỹ năng đang bật (job nền; 1 lần/giờ — SKILL_006)
   *     tags: [Admin/Skills]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       202: { description: "{ jobId, skills }" }
   */
  router.post("/admin/skills/reevaluate", ...guard, update, validateBody(skillReasonSchema), ctl.reevaluate);

  /**
   * @openapi
   * /admin/skills/{id}:
   *   get:
   *     summary: Chi tiết kỹ năng (version cho CAS, holdersCount)
   *     tags: [Admin/Skills]
   *     security: [{ BearerAuth: [] }]
   *   patch:
   *     summary: Sửa kỹ năng (expectedVersion; 409 RES_003 khi lệch). Đổi tiêu chí KHÔNG thu hồi huy hiệu đã cấp; criteriaHarder trong phản hồi
   *     tags: [Admin/Skills]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/admin/skills/:id", ...guard, view, byId, ctl.get);
  router.patch("/admin/skills/:id", ...guard, update, byId, validateBody(updateSkillSchema), ctl.update);

  /**
   * @openapi
   * /admin/skills/{id}/activate:
   *   post:
   *     summary: Bật kỹ năng (lý do) → đánh giá lại, cấp cho người đã đủ. /deactivate tắt (không thu hồi huy hiệu đã cấp)
   *     tags: [Admin/Skills]
   *     security: [{ BearerAuth: [] }]
   */
  router.post("/admin/skills/:id/activate", ...guard, update, byId, validateBody(skillReasonSchema), ctl.activate);
  router.post("/admin/skills/:id/deactivate", ...guard, update, byId, validateBody(skillReasonSchema), ctl.deactivate);

  /**
   * @openapi
   * /admin/skills/{id}/eligible-preview:
   *   get:
   *     summary: Xem trước số người đủ tiêu chí (criteria JSON chưa lưu tuỳ chọn) — { eligibleCount, alreadyHolding, willGrant, sampleUserIds (≤ 5, chỉ id) }
   *     tags: [Admin/Skills]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/admin/skills/:id/eligible-preview", ...guard, view, byId, validateQuery(eligiblePreviewQuerySchema), ctl.preview);

  /**
   * @openapi
   * /admin/users/{id}/skills:
   *   get:
   *     summary: Tiến độ + huy hiệu (kể cả đã thu hồi) của một người — tab "Kỹ năng" trong drawer người dùng
   *     tags: [Admin/Skills]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/admin/users/:id/skills", ...guard, view, byId, ctl.userSkills);

  /**
   * @openapi
   * /admin/users/{id}/skills/{skillId}/proof:
   *   get:
   *     summary: Minh chứng cho vận hành — CHỈ id task rút gọn, điểm, ngày, review (không tiêu đề/nội dung task)
   *     tags: [Admin/Skills]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/admin/users/:id/skills/:skillId/proof", ...guard, view, validateParams(userSkillParamSchema), ctl.userProof);

  /**
   * @openapi
   * /admin/users/{id}/skills/{skillId}/revoke:
   *   post:
   *     summary: Thu hồi huy hiệu (lý do ≥ 10 ký tự; thông báo người dùng; không tự cấp lại). SKILL_003 chưa có huy hiệu. /restore khôi phục — SKILL_004 chưa bị thu hồi
   *     tags: [Admin/Skills]
   *     security: [{ BearerAuth: [] }]
   */
  router.post("/admin/users/:id/skills/:skillId/revoke", ...guard, update, validateParams(userSkillParamSchema), validateBody(skillReasonSchema), ctl.revoke);
  router.post("/admin/users/:id/skills/:skillId/restore", ...guard, update, validateParams(userSkillParamSchema), validateBody(skillReasonSchema), ctl.restore);

  return router;
}

export default createCareerAdminRouter();
