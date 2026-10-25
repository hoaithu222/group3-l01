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
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createBoardController } from "./controllers/board.controller";
import { createLabelController } from "./controllers/label.controller";
import { createTaskAttachmentController } from "./controllers/task-attachment.controller";
import { createTaskChecklistController } from "./controllers/task-checklist.controller";
import { createTaskCommentController } from "./controllers/task-comment.controller";
import { createRescheduleController } from "./controllers/reschedule.controller";
import { createReviewConfigController } from "./controllers/review-config.controller";
import { createTaskReviewController } from "./controllers/task-review.controller";
import { createTaskController } from "./controllers/task.controller";
import { createTaskDependencyController } from "./controllers/task-dependency.controller";
import {
  activityQuerySchema,
  addChecklistItemSchema,
  addDependencySchema,
  attachSchema,
  checklistItemParamsSchema,
  commentsQuerySchema,
  createBoardSchema,
  createCommentSchema,
  createLabelSchema,
  createTaskSchema,
  deleteCommentSchema,
  dependencyParamsSchema,
  ganttQuerySchema,
  getTaskQuerySchema,
  listBoardsQuerySchema,
  listTasksQuerySchema,
  mentionablesQuerySchema,
  moveTaskSchema,
  myReviewsQuerySchema,
  patchChecklistItemSchema,
  patchCommentSchema,
  patchTaskSchema,
  reschedulePreviewSchema,
  putColumnsSchema,
  putReviewConfigSchema,
  reassignReviewSchema,
  rescheduleSchema,
  submitReviewSchema,
  taskAssetParamsSchema,
  updateBoardSchema,
  updateLabelSchema,
  waiveReviewSchema,
  workspaceParamsSchema,
} from "./dtos";
import { createProjectsContainer } from "./projects.container";
import { mountProjectsExtras } from "./projects-extras.routes";

const c = createProjectsContainer();
const board = createBoardController(c.boardService);
const task = createTaskController(c.taskService, c.moveService, c.detailService);
const label = createLabelController(c.labelService);
const checklist = createTaskChecklistController(c.checklistService);
const attachment = createTaskAttachmentController(c.attachmentService);
const comment = createTaskCommentController(c.commentService, c.feedService);
const dependency = createTaskDependencyController(c.dependencyService, c.rescheduleService, c.ganttService);
const reschedule = createRescheduleController(c.rescheduleService);
const reviewConfig = createReviewConfigController(c.review.config);
const taskReview = createTaskReviewController(c.review.query, c.review.submit, c.review.reassign, c.review.waive);

/**
 * Mọi route: đăng nhập → cờ `project` (tắt → 404 `CFG_005`) → rate limit theo user. Quyền do service kiểm qua
 * `permissionService.assert` (scope BOARD/WORKSPACE) để người ngoài/GUEST ra 404 trung tính kể cả khi gọi từ test service.
 */
const M = [authenticateToken, requireFeature(MODULES.PROJECT), apiLimiter] as const;
const ws = validateParams(workspaceParamsSchema);
const byId = validateParams(idParamSchema);

const router = Router();

/**
 * @openapi
 * /workspaces/{workspaceId}/boards:
 *   get:
 *     summary: Danh sách bảng của nhóm (BoardSummaryDto[] — số thẻ theo cột, số thẻ đã xong)
 *     description: "`?archived=true` chỉ bảng đã lưu trữ (mặc định false). Cần `workspace.board.read` (GUEST/người ngoài → 404)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 *   post:
 *     summary: Tạo bảng (OWNER/ADMIN; cột mặc định từ SystemConfig `pm.defaultColumns`)
 *     description: "Idempotency-Key tuỳ chọn. Lỗi: TASK_009 (đủ số bảng), TASK_008 (không đúng 1 cột Hoàn thành), VAL_001."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/workspaces/:workspaceId/boards", ...M, ws, validateQuery(listBoardsQuerySchema), board.list);
router.post("/workspaces/:workspaceId/boards", ...M, ws, idempotencyKey("board-create"), validateBody(createBoardSchema), board.create);

/**
 * @openapi
 * /boards/{id}:
 *   get:
 *     summary: Chi tiết bảng kèm nhãn và myPermissions (BoardDto & { labels, myPermissions })
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 *   patch:
 *     summary: Sửa tên/mô tả bảng (OWNER/ADMIN, expectedVersion)
 *     description: "Lỗi: RES_003 (lệch version, details.currentVersion)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/boards/:id", ...M, byId, board.get);
router.patch("/boards/:id", ...M, byId, validateBody(updateBoardSchema), board.patch);

/**
 * @openapi
 * /boards/{id}/columns:
 *   put:
 *     summary: Ghi đè toàn bộ cột (OWNER/ADMIN, expectedVersion)
 *     description: "Lỗi: TASK_008 (không đúng 1 cột Hoàn thành / đổi loại DONE của cột có thẻ), TASK_007 (bỏ cột còn thẻ, details.taskCount), RES_003."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 * /boards/{id}/archive:
 *   post: { summary: Lưu trữ bảng (idempotent, OWNER/ADMIN), tags: [Projects], security: [{ BearerAuth: [] }] }
 * /boards/{id}/restore:
 *   post: { summary: "Khôi phục bảng (idempotent, TASK_009 nếu nhóm đủ số bảng)", tags: [Projects], security: [{ BearerAuth: [] }] }
 */
router.put("/boards/:id/columns", ...M, byId, validateBody(putColumnsSchema), board.putColumns);
router.post("/boards/:id/archive", ...M, byId, board.archive);
router.post("/boards/:id/restore", ...M, byId, board.restore);

/**
 * @openapi
 * /boards/{id}/tasks:
 *   get:
 *     summary: Thẻ của bảng theo cột (TaskCardDto, sắp theo position)
 *     description: "Lọc: columnId, assigneeId (hoặc `me`), labelId, overdue, dueBefore, q (tiêu đề, không dấu), limitPerColumn ≤ 200. Trả { columns: [{ columnId, tasks, hasMore }] }."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 *   post:
 *     summary: Tạo thẻ (MEMBER+; mặc định cuối cột TODO đầu tiên; clientTaskId idempotent)
 *     description: "201 tạo mới, 200 replay clientTaskId. Lỗi: TASK_001 (cột), TASK_010 (đủ thẻ), VAL_001 (người làm/nhãn không hợp lệ)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/boards/:id/tasks", ...M, byId, validateQuery(listTasksQuerySchema), task.list);
router.post("/boards/:id/tasks", ...M, byId, idempotencyKey("task-create"), validateBody(createTaskSchema), task.create);

/**
 * @openapi
 * /tasks/{id}/move:
 *   post:
 *     summary: Kéo thẻ sang cột/vị trí khác (MEMBER+; server tính position từ afterTaskId/beforeTaskId)
 *     description: "Trả { id, columnId, columnKind, position, version, completedAt }. Lỗi: RES_003 (details.current — hoàn tác optimistic), TASK_001, TASK_002 (policy vào DONE), VAL_001 (hàng xóm không thuộc cột đích)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/tasks/:id/move", ...M, byId, validateBody(moveTaskSchema), task.move);

/**
 * @openapi
 * /tasks/{id}/dependencies:
 *   get:
 *     summary: "(p4-04) Thẻ trước/thẻ sau của thẻ — { predecessors, successors } (id, title, columnKind, startDate, dueDate, assignees)"
 *     description: "Cần `workspace.board.read` (GUEST/người ngoài → 404)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 *   post:
 *     summary: "(p4-04) Thêm phụ thuộc FINISH_TO_START — `:id` là thẻ SAU, body { predecessorId } (201 mới, 200 đã có)"
 *     description: "Cần `workspace.task.update`; 60 lần/phút/người. Lỗi: TASK_017 (cùng thẻ/khác bảng/đã xoá), TASK_018 (đủ 50 phụ thuộc), TASK_005 (vòng, details.cycle), TASK_021 (đồ thị quá lớn)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 * /tasks/{id}/dependencies/{predecessorId}:
 *   delete:
 *     summary: "(p4-04) Xoá phụ thuộc (204, kể cả khi không tồn tại)"
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/tasks/:id/dependencies", ...M, byId, dependency.list);
router.post(
  "/tasks/:id/dependencies",
  ...M,
  byId,
  scopeLimiter("task-dependency", (req) => (req.user ? req.user.id : null), [{ max: 60, windowSeconds: 60 }]),
  validateBody(addDependencySchema),
  dependency.add
);
router.delete("/tasks/:id/dependencies/:predecessorId", ...M, validateParams(dependencyParamsSchema), dependency.remove);

/**
 * @openapi
 * /tasks/{id}/reschedule-preview:
 *   post:
 *     summary: "(p4-04) Xem trước dời lịch theo phụ thuộc khi đổi hạn thẻ nguồn — CHỈ ĐỌC"
 *     description: "Body { dueDate, startDate? }. Trả { source, mode SYNC|BULK, affectedCount, affected (≤ 200) + truncated, skipped (DONE|NO_DATES|DELETED), timezone, previewToken }. Đường găng theo ngày thực tế, không phải CPM đầy đủ. Lỗi: TASK_013 (VAL_001 ở startDate), TASK_021."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/tasks/:id/reschedule-preview", ...M, byId, validateBody(reschedulePreviewSchema), dependency.reschedulePreview);

/**
 * @openapi
 * /tasks/{id}/reschedule:
 *   post:
 *     summary: "(p4-04) Dời lịch các thẻ phía sau theo phụ thuộc khi đổi hạn thẻ nguồn — lệnh TƯỜNG MINH (người dùng đã xem trước)"
 *     description: "Body { dueDate, startDate?, expectedVersion (thẻ nguồn), previewToken (từ reschedule-preview) } — `startDate` vắng = GIỮ ngày bắt đầu của thẻ nguồn, `null` = XOÁ (như PATCH); thẻ SAU luôn giữ thời lượng. Cần `workspace.task.update`; 30 lần/phút/người. Khoá theo bảng. `200 { rescheduleId, applied: [{ taskId, newStartDate, newDueDate, version }] (thẻ nguồn đứng đầu nếu ngày của nó đổi), skipped[] }` áp đồng bộ (≤ 200 thẻ, một transaction) hoặc `202 { batchId, affectedCount }` lô nền (theo dõi bằng GET /reschedule-batches/{id} và socket `board:rescheduled`). Lỗi: RES_003 (thẻ nguồn lệch version, details.currentVersion), TASK_019 (kế hoạch đã cũ — details.preview MỚI), TASK_020 (bảng đang có lần dời khác), TASK_021 (chuỗi quá lớn), TASK_013 (VAL_001 startDate sau hạn), 403 (bảng đã lưu trữ)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 * /reschedule-batches/{id}:
 *   get:
 *     summary: "(p4-04) Trạng thái lô dời lịch nền — { id, status QUEUED|RUNNING|DONE|PARTIAL|FAILED, affectedCount, appliedCount, conflictCount, conflicts (≤ 50), createdAt, finishedAt }"
 *     description: "Người yêu cầu hoặc OWNER/ADMIN của nhóm; người khác/GUEST → 404 trung tính."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/tasks/:id/reschedule",
  ...M,
  byId,
  scopeLimiter("task-reschedule", (req) => (req.user ? req.user.id : null), [{ max: 30, windowSeconds: 60 }]),
  validateBody(rescheduleSchema),
  reschedule.apply
);
router.get("/reschedule-batches/:id", ...M, byId, reschedule.batchStatus);

/**
 * @openapi
 * /boards/{id}/gantt:
 *   get:
 *     summary: "(p4-04, P1) Gantt của bảng: thẻ giao [from, to] (id, title, columnId, columnKind, startDate, dueDate, assigneeIds — CHỈ id người làm, blockedByCount, slackDays, isCritical, conflict) + cạnh { predecessorId, successorId, slackDays }"
 *     description: "Đường găng theo ngày thực tế, không phải CPM đầy đủ. Khoảng ≤ 366 ngày; > 2000 thẻ → truncated. Cần `workspace.board.read`."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/boards/:id/gantt", ...M, byId, validateQuery(ganttQuerySchema), dependency.boardGantt);

/**
 * @openapi
 * /boards/{id}/labels:
 *   get: { summary: Nhãn của bảng, tags: [Projects], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Tạo nhãn (MEMBER+; RES_002 trùng tên, TASK_011 đủ 50 nhãn)", tags: [Projects], security: [{ BearerAuth: [] }] }
 * /labels/{id}:
 *   patch: { summary: Đổi tên/màu nhãn (MEMBER+), tags: [Projects], security: [{ BearerAuth: [] }] }
 *   delete: { summary: "Xoá nhãn (MEMBER nếu chưa dùng, OWNER/ADMIN nếu đang dùng; gỡ khỏi các thẻ)", tags: [Projects], security: [{ BearerAuth: [] }] }
 */
router.get("/boards/:id/labels", ...M, byId, label.list);
router.post("/boards/:id/labels", ...M, byId, validateBody(createLabelSchema), label.create);
router.patch("/labels/:id", ...M, byId, validateBody(updateLabelSchema), label.update);
router.delete("/labels/:id", ...M, byId, label.remove);

// ── p3-03: chi tiết thẻ · checklist · đính kèm · nhật ký · bình luận ─────────────────────────────────────────────

/**
 * @openapi
 * /tasks/{id}:
 *   get:
 *     summary: Chi tiết thẻ (TaskDetailDto = TaskCardDto & { description, startDate, checklist[], createdBy, createdAt, labels[], deletedAt, dependencies { predecessors[], successors[] } (p4-04), myPermissions })
 *     description: "Cần `workspace.board.read` (GUEST/người ngoài → 404). Thẻ đã xoá → 404, trừ `?includeDeleted=true` với người xoá hoặc OWNER/ADMIN (trả kèm `deletedAt`, `myPermissions.restore`)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 *   patch:
 *     summary: Sửa trường thẻ (MEMBER+, expectedVersion) — mỗi trường đổi ghi 1 activity; trả TaskDetailDto
 *     description: "Trường vắng = giữ nguyên, null = xoá (mô tả/ngày/điểm). Lỗi: RES_003 (lệch version, details.currentVersion), TASK_013 (bắt đầu sau hạn), 400 VAL_001 (người làm/nhãn không hợp lệ, details.invalidAssigneeIds/invalidLabelIds), (p4-04) 409 TASK_006 (lùi hạn làm các thẻ phía sau phải dời — details.preview = ReschedulePreviewDto, KHÔNG ghi gì; client xác nhận rồi gọi POST /tasks/{id}/reschedule)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 *   delete:
 *     summary: Xoá mềm thẻ (người tạo hoặc OWNER/ADMIN) → 204
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 * /tasks/{id}/restore:
 *   post:
 *     summary: Khôi phục thẻ đã xoá về cuối cột cũ (người xoá hoặc OWNER/ADMIN, ≤ 30 ngày) → TaskCardDto
 *     description: "Lỗi: TASK_016 (410, quá hạn khôi phục), TASK_010 (bảng đủ thẻ). Cột cũ đã xoá → về cột TODO đầu tiên."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/tasks/:id", ...M, byId, validateQuery(getTaskQuerySchema), task.getById);
router.patch("/tasks/:id", ...M, byId, validateBody(patchTaskSchema), task.patch);
router.delete("/tasks/:id", ...M, byId, task.remove);
router.post("/tasks/:id/restore", ...M, byId, task.restore);

/**
 * @openapi
 * /tasks/{id}/checklist:
 *   post:
 *     summary: Thêm việc nhỏ (MEMBER+) → { item, checklistDone, checklistTotal, version }
 *     description: "Lỗi: TASK_003 (đủ 100 mục). `afterItemId` vắng/không còn = cuối danh sách."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 * /tasks/{id}/checklist/{itemId}:
 *   patch:
 *     summary: Sửa/tick/đổi chỗ một việc nhỏ — KHÔNG cần expectedVersion (hai người tick hai mục khác nhau không xung đột)
 *     description: "Body { text?, done?, moveAfterItemId? (null = lên đầu) }. Tick lặp không đổi bộ đếm/version. Lỗi: 404 (mục không còn)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 *   delete:
 *     summary: Xoá một việc nhỏ → { item (đã xoá), checklistDone, checklistTotal, version }
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.post("/tasks/:id/checklist", ...M, byId, validateBody(addChecklistItemSchema), checklist.add);
router.patch("/tasks/:id/checklist/:itemId", ...M, validateParams(checklistItemParamsSchema), validateBody(patchChecklistItemSchema), checklist.patch);
router.delete("/tasks/:id/checklist/:itemId", ...M, validateParams(checklistItemParamsSchema), checklist.remove);

/**
 * @openapi
 * /tasks/{id}/attachments:
 *   get:
 *     summary: Tệp đính kèm của thẻ (AttachmentDto[], kèm thumbnailUrl ký ≤ 60 s)
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 *   post:
 *     summary: Gắn asset READY (scope TASK, của mình, cùng nhóm) vào thẻ → { attachment, attachmentCount }
 *     description: "Lỗi: TASK_004 (asset chưa READY/không phải của mình/sai scope/đã gắn), TASK_012 (đủ 10 tệp)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 * /tasks/{id}/attachments/{assetId}:
 *   delete:
 *     summary: Gỡ tệp khỏi thẻ (người gắn hoặc OWNER/ADMIN) → 204
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/tasks/:id/attachments", ...M, byId, attachment.list);
router.post("/tasks/:id/attachments", ...M, byId, validateBody(attachSchema), attachment.attach);
router.delete("/tasks/:id/attachments/:assetId", ...M, validateParams(taskAssetParamsSchema), attachment.detach);

/**
 * @openapi
 * /tasks/{id}/activity:
 *   get:
 *     summary: Nhật ký hoạt động của thẻ (TaskActivityDto[], cursor mới → cũ)
 *     description: "Bình luận KHÔNG ghi activity (đã có bản ghi comment; client trộn hai luồng)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 * /tasks/{id}/comments:
 *   get:
 *     summary: Bình luận của thẻ (TaskCommentDto[], cursor mới → cũ, gồm tombstone `deletedAt`)
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 *   post:
 *     summary: Bình luận (MEMBER+; 10/phút/người/thẻ) — nhắc tên bằng marker `@{u:<id>}` + mentions[]
 *     description: "201 tạo mới, 200 gửi lại cùng clientCommentId. Lỗi: TASK_014 (người được nhắc không thuộc nhóm, details.invalidMentions), TASK_004 (tệp không hợp lệ), TASK_012 không áp dụng."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 * /task-comments/{id}:
 *   patch:
 *     summary: Sửa bình luận của mình trong 15 phút (expectedVersion)
 *     description: "Lỗi: TASK_015 (quá 15 phút), RES_003, TASK_014."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 *   delete:
 *     summary: Xoá bình luận (tác giả; hoặc OWNER/ADMIN kèm `reason` 10–500 ký tự + audit) → 204
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 * /boards/{id}/mentionables:
 *   get:
 *     summary: Gợi ý người giao việc/nhắc tên ([{ id, name, avatarUrl }] ≤ 20, MEMBER+ ACTIVE, không email)
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/tasks/:id/activity", ...M, byId, validateQuery(activityQuerySchema), comment.listActivity);
router.get("/tasks/:id/comments", ...M, byId, validateQuery(commentsQuerySchema), comment.listComments);
router.post(
  "/tasks/:id/comments",
  ...M,
  byId,
  scopeLimiter("task-comment", (req) => (req.user ? `${req.user.id}:${req.params.id}` : null), [{ max: 10, windowSeconds: 60 }]),
  validateBody(createCommentSchema),
  comment.createComment
);
router.patch("/task-comments/:id", ...M, byId, validateBody(patchCommentSchema), comment.updateComment);
router.delete("/task-comments/:id", ...M, byId, validateBody(deleteCommentSchema), comment.removeComment);
router.get("/boards/:id/mentionables", ...M, byId, validateQuery(mentionablesQuerySchema), comment.mentionables);

// ── p4-05: chấm chéo (peer review) ────────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /boards/{id}/review-config:
 *   get:
 *     summary: "(p4-05) Cấu hình chấm chéo của bảng — { enabled, requiredReviews, rubric[], reviewerPool?, autoCompleteOnApproval, eligibleReviewerCount, openRoundCount, version }"
 *     description: "Cần `workspace.board.read` (GUEST/người ngoài → 404). `version` = Board.version, dùng làm expectedVersion khi lưu."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 *   put:
 *     summary: "(p4-05) Ghi đè cấu hình chấm chéo (OWNER/ADMIN, CAS Board.version) — đổi rubric/số lượt chỉ áp cho lượt MỚI"
 *     description: "Body { enabled, requiredReviews 1–5, rubric[] ≤ 10 { id?, label, description?, maxScore }, reviewerPool?, autoCompleteOnApproval, expectedVersion }. Bật/tắt ghi outbox review.backfill (mở/huỷ lượt cho thẻ đang ở REVIEW). Lỗi: RES_003 (details.currentVersion), REVIEW_004 (details theo trường), 403 (bảng đã lưu trữ)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/boards/:id/review-config", ...M, byId, reviewConfig.get);
router.put("/boards/:id/review-config", ...M, byId, validateBody(putReviewConfigSchema), reviewConfig.put);

/**
 * @openapi
 * /tasks/{id}/reviews:
 *   get:
 *     summary: "(p4-05) Chấm chéo của thẻ — { enabled, requiredReviews, currentRound, history[≤20], myReview, myPermissions { submit, reassign, waive } }"
 *     description: "Cần `workspace.board.read`. Điểm/nhận xét CHỈ có khi người xem là người làm, OWNER/ADMIN, hoặc người chấm đã nộp/lượt đã đóng; người khác thấy trạng thái + tên người chấm (status của review người khác bị che thành SUBMITTED)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 * /tasks/{id}/review/waive:
 *   post:
 *     summary: "(p4-05) Miễn chấm lượt đang mở (OWNER/ADMIN) — lượt WAIVED, thẻ được kéo sang DONE"
 *     description: "Body { reason 10–500 }. Audit `task-review.waive`. Lỗi: REVIEW_007 (không có lượt mở)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 * /task-reviews/{id}/submit:
 *   post:
 *     summary: "(p4-05) Nộp chấm (người được giao) — Duyệt hoặc Yêu cầu sửa; Idempotency-Key"
 *     description: "Body { status APPROVED|REQUEST_CHANGES, rubricScores[{criterionId,score}] hoặc score10 (không rubric), feedback? (bắt buộc khi REQUEST_CHANGES), expectedVersion (review.version) }. Trả { review, round, task { id, reviewState, columnId, columnKind, position, version } }. Yêu cầu sửa đóng lượt và đưa thẻ về cột IN_PROGRESS. Lỗi: REVIEW_001 (lượt đã đóng/không còn được giao), REVIEW_002 (details.criteria/score10), REVIEW_003 (đang là người làm), REVIEW_006 (thiếu nhận xét), RES_003, 403 (không phải người chấm)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 * /task-reviews/{id}/reassign:
 *   post:
 *     summary: "(p4-05) Giao lại người chấm (OWNER/ADMIN) — { cancelled, assigned }"
 *     description: "Body { toUserId? (vắng = tự chọn cân tải), reason 10–500 }. Audit `task-review.reassign`. Lỗi: REVIEW_001, REVIEW_005 (không có ứng viên), 400 (toUserId là người làm/không thuộc nhóm)."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 * /me/reviews:
 *   get:
 *     summary: "(p4-05) Thẻ cần chấm / đã chấm của tôi (cursor mới → cũ)"
 *     description: "`?status=PENDING|SUBMITTED`. Bỏ nhóm đã rời và thẻ đã xoá. Item: { reviewId, status, assignedAt, submittedAt, task { id, title, boardId, boardName, workspaceId, workspaceName, columnKind }, round { round, approvedCount, requiredReviews } }."
 *     tags: [Projects]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/tasks/:id/reviews", ...M, byId, taskReview.forTask);
router.post("/tasks/:id/review/waive", ...M, byId, validateBody(waiveReviewSchema), taskReview.waiveReview);
router.post("/task-reviews/:id/submit", ...M, byId, idempotencyKey("review-submit"), validateBody(submitReviewSchema), taskReview.submitReview);
router.post("/task-reviews/:id/reassign", ...M, byId, validateBody(reassignReviewSchema), taskReview.reassignReview);
router.get("/me/reviews", ...M, validateQuery(myReviewsQuerySchema), taskReview.mine);

// P1 (p3-03: theo dõi/sao chép thẻ, chuyển việc nhỏ thành thẻ; p3-02: mẫu/sao chép bảng) — route + Swagger ở file riêng.
mountProjectsExtras(router, c, M);

export default router;
