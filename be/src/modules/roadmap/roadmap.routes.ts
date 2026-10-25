import { Router } from "express";
import { apiLimiter, authenticateToken, idempotencyKey, requireFeature, validateBody, validateParams } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createLearnerController } from "./controllers/learner.controller";
import { enrollSchema, patchEnrollmentSchema, putProgressSchema } from "./dtos";
import { registerRoadmapNotificationTypes } from "./notifications/roadmap.notification-types";
import { getRoadmapContainer, registerRoadmapAssetIntegrations } from "./roadmap.container";

const router = Router();
const c = getRoadmapContainer();
const learner = createLearnerController({ subjects: c.subjects, lessons: c.lessons, enrollments: c.enrollments });

// Side-effect lúc import (giống `study.routes.ts`): quyền đọc asset `ROADMAP_SUBJECT_COVER`/`ROADMAP_LESSON` + gate tải lên `ROADMAP`.
registerRoadmapAssetIntegrations();
// Loại thông báo `roadmap.lesson-due-reminder` (p4-07, RM-15) — đăng ký cả ở đây (API) lẫn `jobs/roadmap.jobs.ts` (worker không import routes.ts).
registerRoadmapNotificationTypes();

const guard = [authenticateToken, requireFeature(MODULES.ROADMAP), apiLimiter];
const id = validateParams(idParamSchema);

/**
 * @openapi
 * /roadmap/subjects:
 *   get:
 *     summary: Danh sách môn học đã xuất bản, kèm tiến độ của tôi nếu đã đăng ký
 *     tags: [Roadmap]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "SubjectCardDto[]" }
 */
router.get("/roadmap/subjects", ...guard, learner.listSubjects);

/**
 * @openapi
 * /roadmap/subjects/{idOrSlug}:
 *   get:
 *     summary: Chi tiết môn học — tháng, buổi, tiến độ, lịch từng ngày (nếu đã đăng ký). Nhận id (ObjectId) hoặc slug
 *     tags: [Roadmap]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: SubjectDetailDto }
 */
router.get("/roadmap/subjects/:idOrSlug", ...guard, learner.getSubject);

/**
 * @openapi
 * /roadmap/subjects/{id}/enroll:
 *   post:
 *     summary: Đăng ký lộ trình (ngày bắt đầu + thứ học). RMAP_004 đã đăng ký, RMAP_005 môn chưa có buổi xuất bản
 *     tags: [Roadmap]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: EnrollmentDto }
 */
router.post("/roadmap/subjects/:id/enroll", ...guard, idempotencyKey("roadmap-enroll"), id, validateBody(enrollSchema), learner.enroll);

/**
 * @openapi
 * /roadmap/enrollments/{id}:
 *   patch:
 *     summary: Đổi thứ học hoặc tạm dừng/tiếp tục đăng ký. Đổi thứ học / tiếp tục sau tạm dừng ⇒ lịch tính lại từ buổi chưa qua kế tiếp. RES_003 lệch version
 *     tags: [Roadmap]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: EnrollmentDto }
 */
router.patch("/roadmap/enrollments/:id", ...guard, id, validateBody(patchEnrollmentSchema), learner.patchEnrollment);

/**
 * @openapi
 * /roadmap/enrollments/{id}/reschedule:
 *   post:
 *     summary: Dời lịch — buổi bắt buộc chưa qua kế tiếp xếp vào ngày học gần nhất từ hôm nay (đang tạm dừng thì tiếp tục). Không body. RMAP_004 lộ trình đã hoàn thành
 *     tags: [Roadmap]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: EnrollmentDto }
 */
router.post("/roadmap/enrollments/:id/reschedule", ...guard, id, learner.rescheduleEnrollment);

/**
 * @openapi
 * /roadmap/today:
 *   get:
 *     summary: Buổi kế tiếp chưa xong của mọi lộ trình đang theo học — thẻ "Hôm nay học gì"
 *     tags: [Roadmap]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "TodayItemDto[]" }
 */
router.get("/roadmap/today", ...guard, learner.today);

/**
 * @openapi
 * /roadmap/lessons/{id}:
 *   get:
 *     summary: Nội dung đầy đủ 1 buổi học (khối dựng sẵn, tài liệu, checklist, bộ luyện tập). RMAP_006 buổi chưa mở (SEQUENTIAL)
 *     tags: [Roadmap]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: LessonDto }
 */
router.get("/roadmap/lessons/:id", ...guard, id, learner.getLesson);

/**
 * @openapi
 * /roadmap/lessons/{id}/media:
 *   get:
 *     summary: Ảnh/tệp của buổi học
 *     tags: [Roadmap]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "MediaDto[]" }
 */
router.get("/roadmap/lessons/:id/media", ...guard, id, learner.listMedia);

/**
 * @openapi
 * /roadmap/lessons/{id}/progress:
 *   put:
 *     summary: Lưu tiến độ buổi học (trạng thái, checklist đã tick, tự đánh giá, ghi chú). RMAP_007 mục checklist lạ
 *     tags: [Roadmap]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ progress: ProgressDto, enrolled: boolean }" }
 */
router.put("/roadmap/lessons/:id/progress", ...guard, id, validateBody(putProgressSchema), learner.putProgress);

export default router;
