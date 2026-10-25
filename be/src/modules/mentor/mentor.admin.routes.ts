import { Router } from "express";
import { authenticateToken, requireFeature, requirePermission, validateBody, validateParams } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { getMentorContainer } from "./mentor.container";
import { createMentorAdminController } from "./controllers/mentor.controller";
import { adminReasonSchema, engagementIdParamsSchema, postIdParamsSchema, workspaceParamsSchema } from "./dtos";

const controller = createMentorAdminController(getMentorContainer());
const M = [authenticateToken, requireFeature(MODULES.MENTOR)] as const;
const router = Router();

/**
 * @openapi
 * /admin/mentor/posts/{id}:
 *   get: { summary: "Bài tìm cố vấn cho kiểm duyệt (moderation:view) — không kèm lời nhắn ứng tuyển", tags: [Mentor Admin], security: [{ BearerAuth: [] }] }
 * /admin/mentor/posts/{id}/hide:
 *   post: { summary: "Ẩn bài (moderation:update, lý do 10–500) — đơn chờ EXPIRED, đóng báo cáo mở, audit mentor.post-hide", tags: [Mentor Admin], security: [{ BearerAuth: [] }] }
 * /admin/mentor/posts/{id}/unhide:
 *   post: { summary: "Khôi phục bài (moderation:update) — audit mentor.post-unhide", tags: [Mentor Admin], security: [{ BearerAuth: [] }] }
 */
router.get("/admin/mentor/posts/:id", ...M, requirePermission("moderation:view"), validateParams(postIdParamsSchema), controller.getPost);
router.post(
  "/admin/mentor/posts/:id/hide",
  ...M,
  requirePermission("moderation:update"),
  validateParams(postIdParamsSchema),
  validateBody(adminReasonSchema),
  controller.hide
);
router.post(
  "/admin/mentor/posts/:id/unhide",
  ...M,
  requirePermission("moderation:update"),
  validateParams(postIdParamsSchema),
  validateBody(adminReasonSchema),
  controller.unhide
);

/**
 * @openapi
 * /admin/workspaces/{workspaceId}/mentor:
 *   get: { summary: "Bài + đợt cố vấn của nhóm (workspace:view)", tags: [Mentor Admin], security: [{ BearerAuth: [] }] }
 * /admin/mentor/engagements/{id}/end:
 *   post: { summary: "Kết thúc đợt cấp nền tảng (workspace:update, lý do) — audit mentor.engagement-end-platform", tags: [Mentor Admin], security: [{ BearerAuth: [] }] }
 */
router.get("/admin/workspaces/:workspaceId/mentor", ...M, requirePermission("workspace:view"), validateParams(workspaceParamsSchema), controller.workspace);
router.post(
  "/admin/mentor/engagements/:id/end",
  ...M,
  requirePermission("workspace:update"),
  validateParams(engagementIdParamsSchema),
  validateBody(adminReasonSchema),
  controller.endEngagement
);

export default router;
