import type { RequestHandler, Router } from "express";
import { idempotencyKey, validateBody, validateParams } from "../../core/middlewares";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { createBoardBlueprintController } from "./controllers/board-blueprint.controller";
import { createTaskExtrasController } from "./controllers/task-extras.controller";
import { checklistItemParamsSchema, convertChecklistItemSchema, createBoardFromTemplateSchema, duplicateBoardSchema, duplicateTaskSchema, workspaceParamsSchema } from "./dtos";
import type { ProjectsContainer } from "./projects.container";

/**
 * Route P1 của `projects` (p3-03: theo dõi/sao chép thẻ, chuyển việc nhỏ thành thẻ) — tách khỏi `projects.routes.ts` để file đó không phình thêm.
 * `M` = chuỗi middleware chung (đăng nhập → cờ `project` → `apiLimiter`); quyền do service kiểm qua `permissionService` như mọi route module.
 */
export function mountProjectsExtras(router: Router, c: ProjectsContainer, M: readonly RequestHandler[]): void {
  const extras = createTaskExtrasController(c.watchService, c.duplicateService, c.convertService);
  const blueprints = createBoardBlueprintController(c.blueprintService);
  const byId = validateParams(idParamSchema);
  const ws = validateParams(workspaceParamsSchema);

  /**
   * @openapi
   * /tasks/{id}/watch:
   *   put:
   *     summary: "(P1) Theo dõi thẻ → { watching: true, state: EXPLICIT_ON }"
   *     description: "Idempotent. Cần `workspace.board.read` (GUEST/người ngoài → 404); dùng được cả trên bảng đã lưu trữ. Người theo dõi nhận thêm thông báo bình luận (`TASK_COMMENT`) và nhắc hạn (`TASK_DUE_SOON`)."
   *     tags: [Projects]
   *     security: [{ BearerAuth: [] }]
   *   delete:
   *     summary: "(P1) Bỏ theo dõi thẻ → { watching: false, state: EXPLICIT_OFF }"
   *     description: "Idempotent. Tắt cả khi là người làm/người tạo — chỉ ảnh hưởng thông báo bình luận/nhắc hạn, KHÔNG ảnh hưởng thông báo được giao hoặc được nhắc tên. Không bị tự bật lại khi tiếp tục bình luận."
   *     tags: [Projects]
   *     security: [{ BearerAuth: [] }]
   * /tasks/{id}/watchers:
   *   get:
   *     summary: "(P1) Người đang theo dõi thẻ → { watchers: [{ user: { id, name, avatarUrl }, state }], total, me: { watching, state } }"
   *     description: "`state` ∈ EXPLICIT_ON | AUTO_ON | IMPLICIT (người làm/người tạo chưa có lựa chọn riêng). Chỉ thành viên ACTIVE MEMBER+ hiện tại, tối đa `LIMITS.task.watchersListMax`. `me.state` null = chưa chọn."
   *     tags: [Projects]
   *     security: [{ BearerAuth: [] }]
   */
  router.put("/tasks/:id/watch", ...M, byId, extras.watchTask);
  router.delete("/tasks/:id/watch", ...M, byId, extras.unwatchTask);
  router.get("/tasks/:id/watchers", ...M, byId, extras.listWatchers);

  /**
   * @openapi
   * /tasks/{id}/duplicate:
   *   post:
   *     summary: "(P1) Sao chép thẻ → 201 TaskCardDto (replay `clientTaskId` → 200 thẻ cũ)"
   *     description: "Body { title?, columnId?, keepAssignees=false, keepChecklist=true, clientTaskId?, clientMutationId? }. Sao chép nhãn, mô tả, ngày, điểm, checklist (bỏ tick); KHÔNG sao chép tệp/bình luận/nhật ký/phụ thuộc/trạng thái chấm. Vào cột của thẻ gốc (TODO/IN_PROGRESS, ngay SAU thẻ gốc) — thẻ gốc ở REVIEW/DONE thì vào cột TODO đầu. Cần `workspace.task.create`; lỗi: TASK_010 (bảng đủ thẻ), TASK_001 (cột không có), TASK_002 (đích DONE khi bảng bật chấm chéo), VAL_001."
   *     tags: [Projects]
   *     security: [{ BearerAuth: [] }]
   * /tasks/{id}/checklist/{itemId}/convert:
   *   post:
   *     summary: "(P1) Chuyển việc nhỏ thành thẻ → 201 { task: TaskCardDto, source: { taskId, checklistDone, checklistTotal, version }, created }"
   *     description: "Việc nhỏ bị GỠ khỏi checklist thẻ cha (activity CHECKLIST_REMOVED kèm `after.convertedTaskId`) và thành thẻ mới ở cột TODO đầu (hoặc `columnId`). Gọi lại sau khi đã chuyển → 200 `created:false` với thẻ đã tạo. Cần `workspace.task.update` + `workspace.task.create`; lỗi: 404 (việc nhỏ không còn), TASK_010, TASK_001, TASK_002. Tạo thẻ lỗi ⇒ việc nhỏ được trả về checklist."
   *     tags: [Projects]
   *     security: [{ BearerAuth: [] }]
   */
  router.post("/tasks/:id/duplicate", ...M, byId, idempotencyKey("task-duplicate"), validateBody(duplicateTaskSchema), extras.duplicateTask);
  router.post("/tasks/:id/checklist/:itemId/convert", ...M, validateParams(checklistItemParamsSchema), validateBody(convertChecklistItemSchema), extras.convertChecklistItem);

  /**
   * @openapi
   * /board-templates:
   *   get:
   *     summary: "(P1) Mẫu bảng dựng sẵn → [{ code, name, description, columns: [{ title, kind, wipLimit }], labels: [{ name, color }] }]"
   *     description: "Dữ liệu tĩnh (hiện có COURSE_PROJECT = Đồ án, LIGHT_SCRUM = Scrum nhẹ). Chỉ cần đăng nhập + cờ `project` — không phụ thuộc nhóm."
   *     tags: [Projects]
   *     security: [{ BearerAuth: [] }]
   * /workspaces/{workspaceId}/boards/from-template:
   *   post:
   *     summary: "(P1) Tạo bảng từ mẫu (OWNER/ADMIN) → 201 BoardDto kèm labels[]"
   *     description: "Body { template, name?, description? } — vắng thì lấy tên/mô tả của mẫu. Cột + nhãn của mẫu; cùng quyền/trần với tạo bảng thường (TASK_009 đủ bảng). Idempotency-Key tuỳ chọn."
   *     tags: [Projects]
   *     security: [{ BearerAuth: [] }]
   * /boards/{id}/duplicate:
   *   post:
   *     summary: "(P1) Sao chép bảng (OWNER/ADMIN của nhóm) → 201 BoardDto kèm labels[] (+ copiedTasks, tasksTruncated khi includeTasks)"
   *     description: "Body { name?, includeLabels=true, includeReviewConfig=true, includeTasks=false } — cột (id mới), nhãn, cấu hình chấm chéo, mô tả. includeTasks=true sao chép thẻ CHƯA hoàn thành (không ở cột DONE) sang cột tương ứng của bản sao, giữ thứ tự, nhãn theo tên, mô tả, ngày, điểm, checklist bỏ tick; KHÔNG người làm/bình luận/tệp/nhật ký/phụ thuộc/trạng thái chấm; tối đa 100 thẻ (còn nữa → tasksTruncated=true). Đọc được bảng gốc (kể cả đã lưu trữ); người ngoài/GUEST → 404, MEMBER → 403; lỗi TASK_009 (đủ bảng)."
   *     tags: [Projects]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/board-templates", ...M, blueprints.templates);
  router.post("/workspaces/:workspaceId/boards/from-template", ...M, ws, idempotencyKey("board-from-template"), validateBody(createBoardFromTemplateSchema), blueprints.fromTemplate);
  router.post("/boards/:id/duplicate", ...M, byId, idempotencyKey("board-duplicate"), validateBody(duplicateBoardSchema), blueprints.duplicate);
}
