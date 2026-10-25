import { Router } from "express";
import { apiLimiter, authenticateToken, requireFeature, validateBody, validateParams } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createCareerController } from "./controllers/career.controller";
import { careerVisibilitySchema, userSkillParamSchema } from "./dtos";
import { getCareerContainer, type CareerContainer } from "./career.container";
import { registerCareerModule } from "./index";

/**
 * Router người dùng của p6-06 (path tuyệt đối, mount ở root v1): danh mục + tiến độ, huy hiệu của tôi/người khác, minh chứng lọc riêng tư, quyền riêng tư
 * nghề nghiệp. Cờ `career` (tắt → 404 `CFG_005`). ⛔ KHÔNG có route tạo/sửa huy hiệu phía người dùng — `POST /me/skills` = 404 (CR-03).
 */
export function createCareerRouter(c: CareerContainer = getCareerContainer()): Router {
  const controller = createCareerController(c.query, c.profile);
  const guard = [authenticateToken, requireFeature(MODULES.CAREER), apiLimiter];
  const router = Router();

  /**
   * @openapi
   * /skills:
   *   get:
   *     summary: Danh mục kỹ năng đang bật + tiến độ của tôi ("còn thiếu") + trạng thái huy hiệu
   *     tags: [Skills]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: "[{ id, code, name, description, category, icon, labelMatch[], criteria: { requiredTasksDone, minStoryPoints, minAvgPeerScore, requireReview }, order, myProgress: { tasksDone, storyPoints, avgPeerScore, reviewedTasks, achieved, remaining: { tasks, storyPoints, peerScore, reviewedTasks } }, myBadge: { unlockedAt, revoked } | null }]" }
   */
  router.get("/skills", ...guard, controller.catalog);

  /**
   * @openapi
   * /skills/{id}:
   *   get:
   *     summary: Chi tiết một kỹ năng (đang bật, hoặc đã tắt mà tôi có huy hiệu) — 404 "Kỹ năng không còn"
   *     tags: [Skills]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/skills/:id", ...guard, validateParams(idParamSchema), controller.detail);

  /**
   * @openapi
   * /me/skills:
   *   get:
   *     summary: Huy hiệu kỹ năng của tôi (kể cả đã thu hồi — revokedNotice trung tính) + số liệu minh chứng
   *     tags: [Skills]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: "[{ skill, unlockedAt, revoked, revokedNotice, proof: { tasksDone, storyPoints, avgPeerScore } }]" }
   */
  router.get("/me/skills", ...guard, controller.myBadges);

  /**
   * @openapi
   * /users/{id}/skills:
   *   get:
   *     summary: Huy hiệu còn hiệu lực của một người — chính mình, vận hành skill:view, hoặc thành viên CÙNG nhóm khi người đó bật showSkills; còn lại 404
   *     tags: [Skills]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/users/:id/skills", ...guard, validateParams(idParamSchema), controller.userBadges);

  /**
   * @openapi
   * /users/{id}/skills/{skillId}/proof:
   *   get:
   *     summary: Minh chứng (top 5 task) lọc theo người xem — tiêu đề task chỉ khi chính chủ / proofTitles / cùng nhóm của task; tên nhóm chỉ với thành viên nhóm đó (CR-26)
   *     tags: [Skills]
   *     security: [{ BearerAuth: [] }]
   *     responses:
   *       200: { description: "{ skill, unlockedAt, revoked, tasksDone, storyPoints, avgPeerScore, tasks: [{ title | null, storyPoints, completedAt, reviewScore | null, workspaceName | null }], verifiedBy: SYSTEM }" }
   */
  router.get("/users/:id/skills/:skillId/proof", ...guard, validateParams(userSkillParamSchema), controller.proof);

  /**
   * @openapi
   * /me/career:
   *   get:
   *     summary: Hồ sơ nghề nghiệp của tôi (openToWork, headline, preferredRoles, location, visibility) — mặc định khi chưa có
   *     tags: [Career]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/me/career", ...guard, controller.myCareer);

  /**
   * @openapi
   * /me/career/visibility:
   *   put:
   *     summary: Quyền riêng tư nghề nghiệp { showSkills, proofTitles, showContribution, showQuiz, appearInOthersPortfolios? }
   *     tags: [Career]
   *     security: [{ BearerAuth: [] }]
   */
  router.put("/me/career/visibility", ...guard, validateBody(careerVisibilitySchema), controller.updateVisibility);

  return router;
}

const router = createCareerRouter();

// Loại thông báo `career.skill-*` (side-effect lúc import, giống `gamification.routes.ts`; worker đăng ký ở `jobs/career.jobs.ts`).
registerCareerModule();

export default router;
