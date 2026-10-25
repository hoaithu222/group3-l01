import { Router } from "express";
import {
  apiLimiter,
  authenticateToken,
  idempotencyKey,
  requireFeature,
  scopeLimiter,
  validateBody,
  validateParams,
  validateQuery,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { getMentorContainer } from "./mentor.container";
import { createMentorController } from "./controllers/mentor.controller";
import {
  acceptSchema,
  applicationIdParamsSchema,
  applySchema,
  createPostSchema,
  endSchema,
  engagementIdParamsSchema,
  extendSchema,
  listApplicationsQuerySchema,
  listEngagementsQuerySchema,
  listPostsQuerySchema,
  postIdParamsSchema,
  rejectSchema,
  reportPostSchema,
  updatePostSchema,
  workspaceParamsSchema,
} from "./dtos";

const controller = createMentorController(getMentorContainer());

// Mọi route: đăng nhập → cờ `mentor` (tắt → 404 CFG_005) → rate limit theo user. Quyền OWNER/ADMIN do service kiểm
// (`assertWorkspaceAdmin`): khách/người ngoài → 404 trung tính, thành viên thường → 403 PERM_001.
const M = [authenticateToken, requireFeature(MODULES.MENTOR), apiLimiter] as const;
const router = Router();

/**
 * @openapi
 * /mentor/posts:
 *   get: { summary: "Bảng tin tìm cố vấn (q, skills CSV — có đủ mọi kỹ năng, status, cursor)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 * /mentor/posts/{id}:
 *   get: { summary: "Chi tiết bài + myActions {apply, manage, report, withdraw} (bài ẩn → 404)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 *   patch: { summary: "Sửa bài (OWNER/ADMIN, expectedVersion → 409 RES_003)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 */
router.get("/mentor/posts", ...M, validateQuery(listPostsQuerySchema), controller.feed);
router.get("/mentor/posts/:id", ...M, validateParams(postIdParamsSchema), controller.detail);
router.patch("/mentor/posts/:id", ...M, validateParams(postIdParamsSchema), validateBody(updatePostSchema), controller.update);

/**
 * @openapi
 * /workspaces/{workspaceId}/mentor/posts:
 *   get: { summary: "Mọi bài của nhóm + số đơn chờ (OWNER/ADMIN)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Đăng bài (OWNER/ADMIN, Idempotency-Key; ≤ 3 bài OPEN → MENTOR_001)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 */
router.get("/workspaces/:workspaceId/mentor/posts", ...M, validateParams(workspaceParamsSchema), controller.workspacePosts);
router.post(
  "/workspaces/:workspaceId/mentor/posts",
  ...M,
  validateParams(workspaceParamsSchema),
  idempotencyKey("mentor-post"),
  validateBody(createPostSchema),
  controller.create
);

/**
 * @openapi
 * /mentor/posts/{id}/close:
 *   post: { summary: "Đóng bài (đơn chờ → EXPIRED, đợt đang chạy giữ nguyên)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 * /mentor/posts/{id}/applications:
 *   get: { summary: "Đơn của bài (OWNER/ADMIN, status, cursor)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Ứng tuyển (MENTOR_002/003/004/006; 10 lượt/giờ/người)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 * /mentor/posts/{id}/report:
 *   post: { summary: "Báo cáo bài (p1-08, gộp theo bài; 201 mới / 200 đã báo cáo)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 */
router.post("/mentor/posts/:id/close", ...M, validateParams(postIdParamsSchema), controller.close);
router.get("/mentor/posts/:id/applications", ...M, validateParams(postIdParamsSchema), validateQuery(listApplicationsQuerySchema), controller.postApplications);
router.post(
  "/mentor/posts/:id/applications",
  ...M,
  validateParams(postIdParamsSchema),
  idempotencyKey("mentor-apply"),
  scopeLimiter("mentor-apply", (req) => req.user?.id ?? null, [{ max: LIMITS.mentor.applyPerHour, windowSeconds: 3600 }]),
  validateBody(applySchema),
  controller.apply
);
router.post("/mentor/posts/:id/report", ...M, validateParams(postIdParamsSchema), validateBody(reportPostSchema), controller.report);

/**
 * @openapi
 * /me/mentor/applications:
 *   get: { summary: "Đơn của tôi + trạng thái bài + đợt cố vấn (khi được chấp nhận)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 * /mentor/applications/{id}/accept:
 *   post: { summary: "Chấp nhận → khách có hạn + kênh chỉ định + (tuỳ chọn) nhóm chat; MENTOR_005/008/010", tags: [Mentor], security: [{ BearerAuth: [] }] }
 * /mentor/applications/{id}/reject:
 *   post: { summary: "Từ chối (lý do tuỳ chọn)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 * /mentor/applications/{id}/withdraw:
 *   post: { summary: "Rút đơn (chính người ứng tuyển, PENDING)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 */
router.get("/me/mentor/applications", ...M, validateQuery(listApplicationsQuerySchema), controller.myApplications);
router.post(
  "/mentor/applications/:id/accept",
  ...M,
  validateParams(applicationIdParamsSchema),
  idempotencyKey("mentor-accept"),
  validateBody(acceptSchema),
  controller.accept
);
router.post("/mentor/applications/:id/reject", ...M, validateParams(applicationIdParamsSchema), validateBody(rejectSchema), controller.reject);
router.post("/mentor/applications/:id/withdraw", ...M, validateParams(applicationIdParamsSchema), controller.withdraw);

/**
 * @openapi
 * /workspaces/{workspaceId}/mentor/engagements:
 *   get: { summary: "Đợt cố vấn của nhóm (OWNER/ADMIN, status)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 * /me/mentor/engagements:
 *   get: { summary: "Các nhóm tôi đang cố vấn (status mặc định ACTIVE)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 * /mentor/engagements/{id}/extend:
 *   post: { summary: "Gia hạn (OWNER/ADMIN, tổng ≤ 90 ngày → MENTOR_007)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 * /mentor/engagements/{id}/end:
 *   post: { summary: "Kết thúc (OWNER/ADMIN hoặc cố vấn tự rời; MENTOR_009)", tags: [Mentor], security: [{ BearerAuth: [] }] }
 */
router.get(
  "/workspaces/:workspaceId/mentor/engagements",
  ...M,
  validateParams(workspaceParamsSchema),
  validateQuery(listEngagementsQuerySchema),
  controller.workspaceEngagements
);
router.get("/me/mentor/engagements", ...M, validateQuery(listEngagementsQuerySchema), controller.myEngagements);
router.post("/mentor/engagements/:id/extend", ...M, validateParams(engagementIdParamsSchema), validateBody(extendSchema), controller.extend);
router.post("/mentor/engagements/:id/end", ...M, validateParams(engagementIdParamsSchema), validateBody(endSchema), controller.end);

export default router;
