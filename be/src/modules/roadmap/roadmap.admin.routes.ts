import { Router } from "express";
import { authenticateToken, requireFeature, requirePermission, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { idParamSchema, reasonSchema } from "../../shared/dto/common-schemas";
import { createAdminRoadmapController } from "./controllers/admin.controller";
import { addMediaSchema, adminSubjectsQuerySchema, createLessonSchema, createPhaseSchema, createSubjectSchema, patchLessonSchema, patchMediaSchema, patchPhaseSchema, patchSubjectSchema, previewSchema, reorderSchema } from "./dtos";
import { getRoadmapContainer } from "./roadmap.container";

/**
 * Admin Lộ trình học (admin.md §1) — mount ở root v1 (path tuyệt đối `/admin/roadmap/*`). Mọi ghi cần `roadmap:*`
 * (`requirePermission`); gỡ xuất bản/lưu trữ/xoá bắt buộc `reason` (`reasonSchema`, 10–500 ký tự) + audit.
 */
const router = Router();
const c = getRoadmapContainer();
const admin = createAdminRoadmapController({ subjects: c.adminSubjects, lessons: c.adminLessons });

const guard = [authenticateToken, requireFeature(MODULES.ROADMAP)];
const id = validateParams(idParamSchema);

router.get("/admin/roadmap/subjects", ...guard, requirePermission("roadmap:view"), validateQuery(adminSubjectsQuerySchema), admin.listSubjects);
router.post("/admin/roadmap/subjects", ...guard, requirePermission("roadmap:create"), validateBody(createSubjectSchema), admin.createSubject);
router.get("/admin/roadmap/subjects/:id", ...guard, requirePermission("roadmap:view"), id, admin.getSubject);
router.patch("/admin/roadmap/subjects/:id", ...guard, requirePermission("roadmap:update"), id, validateBody(patchSubjectSchema), admin.patchSubject);
router.delete("/admin/roadmap/subjects/:id", ...guard, requirePermission("roadmap:delete"), id, validateBody(reasonSchema.extend({ expectedVersion: patchSubjectSchema.shape.expectedVersion })), admin.removeSubject);

router.post("/admin/roadmap/subjects/:id/publish", ...guard, requirePermission("roadmap:update"), id, admin.publishSubject);
router.post("/admin/roadmap/subjects/:id/unpublish", ...guard, requirePermission("roadmap:update"), id, validateBody(reasonSchema.extend({ expectedVersion: patchSubjectSchema.shape.expectedVersion })), admin.unpublishSubject);
router.post("/admin/roadmap/subjects/:id/archive", ...guard, requirePermission("roadmap:update"), id, validateBody(reasonSchema.extend({ expectedVersion: patchSubjectSchema.shape.expectedVersion })), admin.archiveSubject);

router.post("/admin/roadmap/subjects/:id/phases", ...guard, requirePermission("roadmap:create"), id, validateBody(createPhaseSchema), admin.createPhase);
router.patch("/admin/roadmap/phases/:id", ...guard, requirePermission("roadmap:update"), id, validateBody(patchPhaseSchema), admin.patchPhase);
router.delete("/admin/roadmap/phases/:id", ...guard, requirePermission("roadmap:delete"), id, validateBody(reasonSchema), admin.deletePhase);
router.put("/admin/roadmap/subjects/:id/order", ...guard, requirePermission("roadmap:update"), id, validateBody(reorderSchema), admin.reorder);

router.post("/admin/roadmap/phases/:id/lessons", ...guard, requirePermission("roadmap:create"), id, validateBody(createLessonSchema), admin.createLesson);
router.get("/admin/roadmap/lessons/:id", ...guard, requirePermission("roadmap:view"), id, admin.getLesson);
router.get("/admin/roadmap/lessons/:id/media", ...guard, requirePermission("roadmap:view"), id, admin.listLessonMedia);
router.patch("/admin/roadmap/lessons/:id", ...guard, requirePermission("roadmap:update"), id, validateBody(patchLessonSchema), admin.patchLesson);
router.delete("/admin/roadmap/lessons/:id", ...guard, requirePermission("roadmap:delete"), id, validateBody(reasonSchema.extend({ expectedVersion: patchSubjectSchema.shape.expectedVersion })), admin.removeLesson);
router.post("/admin/roadmap/lessons/:id/publish", ...guard, requirePermission("roadmap:update"), id, admin.publishLesson);
router.post("/admin/roadmap/lessons/:id/unpublish", ...guard, requirePermission("roadmap:update"), id, admin.unpublishLesson);

router.post("/admin/roadmap/preview", ...guard, requirePermission("roadmap:view"), validateBody(previewSchema), admin.preview);

router.post("/admin/roadmap/lessons/:id/media", ...guard, requirePermission("roadmap:update"), id, validateBody(addMediaSchema), admin.addMedia);
router.patch("/admin/roadmap/media/:id", ...guard, requirePermission("roadmap:update"), id, validateBody(patchMediaSchema), admin.patchMedia);
router.delete("/admin/roadmap/media/:id", ...guard, requirePermission("roadmap:update"), id, admin.removeMedia);

export default router;
