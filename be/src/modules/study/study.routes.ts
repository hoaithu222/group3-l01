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
import { bodyLimit } from "../../core/middlewares/body-limit";
import { MODULES } from "../../core/constants/modules";
import { LIMITS } from "../../core/constants/limits";
import { ErrorCode } from "../../core/utils/error.codes";
import { idParamSchema, reasonSchema } from "../../shared/dto/common-schemas";
import { createStudyItemController } from "./controllers/study-item.controller";
import { createStudySetController } from "./controllers/study-set.controller";
import {
  createSetSchema,
  duplicateSetSchema,
  listItemsQuerySchema,
  listSetsQuerySchema,
  patchSetSchema,
  popularTagsQuerySchema,
  putItemsSchema,
  reportSetSchema,
} from "./dtos";
import { createMockRouter } from "./mock.routes";
import { registerStudyNotificationTypes } from "./notifications/study.notification-types";
import { createSrRouter } from "./sr.routes";
import { getStudyContainer, registerStudyIntegrations } from "./study.container";

const router = Router();

// ── DI wiring ────────────────────────────────────────────────────────────────
const c = getStudyContainer();
const sets = createStudySetController({ sets: c.sets, lists: c.lists, duplicates: c.duplicates, reports: c.reports, moderation: c.moderation });
const items = createStudyItemController(c.itemQuery, c.itemBulk);

// Side-effect lúc import (giống `registerAssetScopeGate` ở `resources.routes.ts`): quyền đọc asset `STUDY_ITEM`/`STUDY_SET_COVER`
// và đích báo cáo `STUDY_SET`. Worker đăng ký riêng ở `jobs/study-report.consumer.ts` (không import routes).
registerStudyIntegrations();
// p4-02 — loại thông báo `SR_DUE_REMINDER`/`MOCK_AUTO_SUBMITTED` (API đọc hộp thư cần biết loại; worker đăng ký ở file job).
registerStudyNotificationTypes();

const guard = [authenticateToken, requireFeature(MODULES.STUDY), apiLimiter];
const id = validateParams(idParamSchema);

/** Chung bộ đếm `report` với `POST /reports` (moderation): 20 báo cáo/giờ/người bất kể loại đích — vượt → 429 `MOD_006`. */
const reportRateLimiter = scopeLimiter("report", (req) => req.user?.id ?? null, [{ max: LIMITS.report.ratePerHour, windowSeconds: 3600 }], ErrorCode.MOD_006);

/**
 * @openapi
 * /study-sets:
 *   get:
 *     summary: Danh sách bộ học theo phạm vi (mine | workspace | public), tìm không dấu, lọc thẻ (cursor)
 *     description: |
 *       `scope=workspace` cần `workspaceId` và là thành viên (GUEST/người ngoài → 404). `q` tối thiểu 2 ký tự (AND từng từ trên tiêu đề
 *       không dấu). `hasQuiz=true` chỉ bộ có câu chấm điểm được. Bộ đã ẩn chỉ hiện cho tác giả (mine) và OWNER/ADMIN nhóm (workspace).
 *     tags: [Study]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: scope, in: query, schema: { type: string, enum: [mine, workspace, public], default: mine } }
 *       - { name: workspaceId, in: query, schema: { type: string } }
 *       - { name: q, in: query, schema: { type: string, minLength: 2, maxLength: 100 } }
 *       - { name: tag, in: query, schema: { type: string } }
 *       - { name: hasQuiz, in: query, schema: { type: string, enum: ["true", "false"] } }
 *       - { name: cursor, in: query, schema: { type: string } }
 *       - { name: limit, in: query, schema: { type: integer } }
 *     responses:
 *       200: { description: "data: StudySetSummaryDto[], meta: { nextCursor, hasMore, limit }" }
 */
router.get("/study-sets", ...guard, validateQuery(listSetsQuerySchema), sets.list);

/**
 * @openapi
 * /study-sets:
 *   post:
 *     summary: Tạo bộ học (Idempotency-Key). STUDY_003 thiếu nhóm, STUDY_007 quá số bộ, STUDY_008 PUBLIC thiếu xác nhận
 *     tags: [Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: "StudySetDto & { myPermissions }" }
 */
router.post("/study-sets", ...guard, idempotencyKey("study-set-create"), validateBody(createSetSchema), sets.create);

/**
 * @openapi
 * /study-tags/popular:
 *   get:
 *     summary: Thẻ phổ biến (≤ 30, cache 10 phút) — bộ PUBLIC, hoặc bộ WORKSPACE của một nhóm
 *     tags: [Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "[{ tag, count }]" }
 */
router.get("/study-tags/popular", ...guard, validateQuery(popularTagsQuerySchema), sets.popularTags);

/**
 * @openapi
 * /study-sets/{id}:
 *   get:
 *     summary: Chi tiết bộ học + myPermissions (server tính) — không thấy → 404 trung tính
 *     tags: [Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "StudySetDto & { myPermissions: { edit, delete, duplicate, report, hide, unhide } }" }
 */
router.get("/study-sets/:id", ...guard, id, sets.get);

/**
 * @openapi
 * /study-sets/{id}:
 *   patch:
 *     summary: Sửa thông tin/phạm vi bộ học (chỉ tác giả). RES_003 lệch phiên bản, STUDY_008, STUDY_003, STUDY_004 bộ đã ẩn
 *     tags: [Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "StudySetDto & { myPermissions }" }
 */
router.patch("/study-sets/:id", ...guard, id, validateBody(patchSetSchema), sets.patch);

/**
 * @openapi
 * /study-sets/{id}:
 *   delete:
 *     summary: Xoá mềm bộ học (chỉ tác giả)
 *     tags: [Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Đã xoá }
 */
router.delete("/study-sets/:id", ...guard, id, sets.remove);

/**
 * @openapi
 * /study-sets/{id}/items:
 *   get:
 *     summary: Mục học KÈM đáp án (chế độ học) — mặc định toàn bộ ≤ 500; meta.setVersion = phiên bản bộ lúc đọc
 *     tags: [Study]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { name: cursor, in: query, schema: { type: string } }
 *       - { name: limit, in: query, schema: { type: integer, maximum: 500 } }
 *     responses:
 *       200: { description: "data: StudyItemDto[], meta: { nextCursor, hasMore, limit, setVersion }" }
 */
router.get("/study-sets/:id/items", ...guard, id, validateQuery(listItemsQuerySchema), items.list);

/**
 * @openapi
 * /study-sets/{id}/items:
 *   put:
 *     summary: Lưu hàng loạt mục học { expectedVersion, upsert[], delete[] } trong MỘT transaction (thân ≤ 2 MB)
 *     description: |
 *       Client gửi INDEX đáp án (`correctOptionIndex` / `correctOptionIndexes` / `correct`); server chuyển thành `correctOptionIds`.
 *       Mục `upsert` ghi ĐÈ toàn bộ nội dung. `afterClientItemKey`: null = đầu danh sách, chuỗi = sau mục có khoá/`id` đó, thiếu = mục mới xuống cuối.
 *       Lỗi mục → 400 `STUDY_001` với `details: [{ index, clientItemKey, field, code }]` (gom tất cả, tối đa 50); quá 500 mục → 409 `STUDY_002`;
 *       lệch phiên bản → 409 `RES_003` (`details.currentVersion`); bộ đã ẩn → 409 `STUDY_004`; thân > 2 MB → 413.
 *     tags: [Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ version, itemCount, idMap: [{ clientItemKey, id }] }" }
 */
router.put("/study-sets/:id/items", ...guard, id, bodyLimit(LIMITS.study.bodyMaxBytes), validateBody(putItemsSchema), items.put);

/**
 * @openapi
 * /study-sets/{id}/duplicate:
 *   post:
 *     summary: Nhân bản bộ về tài khoản của tôi (mục + AssetLink mới trỏ cùng asset; không copy tệp). STUDY_004 bộ đã ẩn
 *     tags: [Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: "StudySetDto & { myPermissions }" }
 */
router.post("/study-sets/:id/duplicate", ...guard, id, idempotencyKey("study-set-duplicate"), validateBody(duplicateSetSchema), sets.duplicate);

/**
 * @openapi
 * /study-sets/{id}/report:
 *   post:
 *     summary: Báo cáo bộ học PUBLIC/WORKSPACE (1 báo cáo/người/bộ — lần lặp trả 200 alreadyReported)
 *     tags: [Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: "{ id, status, createdAt, alreadyReported: false }" }
 *       200: { description: "{ id, status, createdAt, alreadyReported: true }" }
 */
router.post("/study-sets/:id/report", ...guard, id, reportRateLimiter, validateBody(reportSetSchema), sets.report);

/**
 * @openapi
 * /study-sets/{id}/hide:
 *   post:
 *     summary: OWNER/ADMIN nhóm ẩn bộ WORKSPACE vi phạm (lý do 10–500 ký tự, có audit, đóng báo cáo mở)
 *     tags: [Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "StudySetDto & { myPermissions }" }
 */
router.post("/study-sets/:id/hide", ...guard, id, validateBody(reasonSchema), sets.hide);

/**
 * @openapi
 * /study-sets/{id}/unhide:
 *   post:
 *     summary: OWNER/ADMIN nhóm khôi phục bộ WORKSPACE đã ẩn (có audit)
 *     tags: [Study]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "StudySetDto & { myPermissions }" }
 */
router.post("/study-sets/:id/unhide", ...guard, id, validateBody(reasonSchema), sets.unhide);

// p4-02 — thi thử (`/study-sets/:id/mock-attempts`, `/me/mock-attempts`, `/mock-attempts/*`) và ôn tập SM-2 (`/sr/*`), path tuyệt đối như trên.
router.use(createMockRouter(c.mock));
router.use(createSrRouter(c.sr, c.srReview));

export default router;
