import { Router } from "express";
import { apiLimiter, authenticateToken, methodNotAllowed, requireFeature, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { LIMITS } from "../../core/constants/limits";
import { MODULES } from "../../core/constants/modules";
import { createContributionConfigController } from "./controllers/contribution-config.controller";
import { createContributionController } from "./controllers/contribution.controller";
import { createContributionExportController } from "./controllers/contribution-export.controller";
import { createHeatmapController } from "./controllers/heatmap.controller";
import {
  boardIdParamSchema,
  contributionQuerySchema,
  createExportSchema,
  exportDownloadQuerySchema,
  exportIdParamSchema,
  heatmapQuerySchema,
  memberTasksParamsSchema,
  memberTasksQuerySchema,
  putContributionConfigSchema,
  workspaceIdParamSchema,
} from "./dtos";
import { getContributionContainer, type ContributionContainer } from "./contribution.container";
import { registerContributionModule } from "./index";

/** Dựng router theo container (test truyền container có cổng giả; mặc định là container dùng chung). */
export function createContributionRouter(c: ContributionContainer = getContributionContainer()): Router {
  const contribution = createContributionController(c.reports, c.memberTasks);
  const config = createContributionConfigController(c.config);
  const heatmap = createHeatmapController(c.heatmap);
  const exportController = createContributionExportController(c.exports);

  /**
   * Mọi route đọc/ghi: đăng nhập → cờ `project` (tắt → 404 `CFG_005`) → rate limit theo user. Quyền do service kiểm qua `permissionService.assert` (scope BOARD/WORKSPACE):
   * khách/người ngoài → 404 trung tính. Báo cáo là CHỈ ĐỌC — phương thức ghi tới `/boards/:id/contribution*` bị `methodNotAllowed` chặn (405 CONTRIB_001).
   */
  const M = [authenticateToken, requireFeature(MODULES.PROJECT), apiLimiter] as const;
  const byBoard = validateParams(boardIdParamSchema);

  const router = Router();

  /**
   * @openapi
   * /boards/{id}/contribution:
   *   get:
   *     summary: "(p4-06) Báo cáo đóng góp của bảng theo kỳ — ContributionReportDto { boardId, period, formula { weights, onTimeGraceHours, unestimatedPoints, definitions, changedAt, changedBy, previousWeights }, members[{ user, số gốc, components, weightsUsed, score, share, explanation }], totals, maxStoryPoints, computedAt, stale }"
   *     description: "`?period=ALL|M:2026-09|W:2026-W37` (mặc định ALL). OWNER/ADMIN/MEMBER xem được cả bảng; GUEST/người ngoài → 404. Lỗi: CONTRIB_003 (kỳ sai). PATCH/PUT/POST/DELETE → 405 CONTRIB_001."
   *     tags: [Contribution]
   *     security: [{ BearerAuth: [] }]
   * /boards/{id}/contribution/periods:
   *   get:
   *     summary: "(p4-06) Các kỳ có dữ liệu — { timezone, months: [M:…], weeks: [W:…] } (mới nhất trước)"
   *     tags: [Contribution]
   *     security: [{ BearerAuth: [] }]
   * /boards/{id}/contribution/members/{userId}/tasks:
   *   get:
   *     summary: "(p4-06) Thẻ được tính của MỘT người trong kỳ (cursor, mới → cũ) — [{ taskId, title|null, deleted, storyPoints, sharedPoints, assigneeCount, dueDate, completedAt, onTime, reviewScoreAvg, reviewCount }]"
   *     description: "`?period&cursor&limit ≤ 50`. Người không phải (từng là) thành viên nhóm → 404."
   *     tags: [Contribution]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/boards/:id/contribution", ...M, byBoard, validateQuery(contributionQuerySchema), contribution.report);
  router.get("/boards/:id/contribution/periods", ...M, byBoard, contribution.periods);
  router.get("/boards/:id/contribution/members/:userId/tasks", ...M, validateParams(memberTasksParamsSchema), validateQuery(memberTasksQuerySchema), contribution.memberTasks);

  /**
   * @openapi
   * /boards/{id}/contribution-config:
   *   get:
   *     summary: "(p4-06) Công thức của bảng — { weights, onTimeGraceHours, unestimatedPoints, version, changedAt, changedBy, previousWeights, isDefault, definitions }"
   *     tags: [Contribution]
   *     security: [{ BearerAuth: [] }]
   *   put:
   *     summary: "(p4-06) Đổi trọng số/cho phép trễ/điểm thẻ chưa gán — OWNER/ADMIN (`workspace.board.edit`), KHÔNG nhận giá trị theo người"
   *     description: "Body { weights { points, onTime, peer }, onTimeGraceHours?, unestimatedPoints?, expectedVersion } (`.strict()`). Lỗi: CONTRIB_002 (tổng ≠ 100), RES_003 (lệch version, details.currentVersion), VAL_001 (trường lạ), 403 (MEMBER / bảng đã lưu trữ). Audit `board.contribution-config`, tính lại ngay."
   *     tags: [Contribution]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/boards/:id/contribution-config", ...M, byBoard, config.get);
  router.put("/boards/:id/contribution-config", ...M, byBoard, validateBody(putContributionConfigSchema), config.put);

  /**
   * @openapi
   * /boards/{id}/heatmap:
   *   get:
   *     summary: "(p4-06) Hoạt động theo NGÀY của bảng (tuỳ chọn ?userId) — { timezone, from, to, userId?, days: [{ date, total, task, checklist, comment, review }], maxTotal }"
   *     description: "`?from=YYYY-MM-DD&to=YYYY-MM-DD` (< 366 ngày, theo múi giờ `pm.timezone`). CHỈ ngày + số đếm, không giờ. Lỗi: CONTRIB_004 (khoảng quá dài / from > to), 404 (khách, người ngoài, userId lạ)."
   *     tags: [Contribution]
   *     security: [{ BearerAuth: [] }]
   * /workspaces/{id}/activity-heatmap:
   *   get:
   *     summary: "(p4-06) Heatmap hoạt động của CẢ NHÓM (gộp mọi bảng) — cùng dạng /boards/{id}/heatmap"
   *     tags: [Contribution]
   *     security: [{ BearerAuth: [] }]
   */
  router.get("/boards/:id/heatmap", ...M, byBoard, validateQuery(heatmapQuerySchema), heatmap.board);
  router.get("/workspaces/:id/activity-heatmap", ...M, validateParams(workspaceIdParamSchema), validateQuery(heatmapQuerySchema), heatmap.workspace);

  /**
   * @openapi
   * /boards/{id}/contribution/export:
   *   post:
   *     summary: "(p4-06) Xuất PDF báo cáo (job nền) — 202 { exportId, status } | 200 khi cùng dữ liệu đã có bản READY"
   *     description: "Body { period, includeHeatmap? }. OWNER/ADMIN/MEMBER. 5 lần/giờ/người/bảng → 429. Lỗi: CONTRIB_003, 429. Xong → thông báo `contribution.export-ready`."
   *     tags: [Contribution]
   *     security: [{ BearerAuth: [] }]
   * /contribution-exports/{id}:
   *   get:
   *     summary: "(p4-06) Trạng thái bản xuất — { id, status, periodKey, verifyCode, dataHash, createdAt, readyAt, expiresAt, url? }"
   *     description: "`?download=1` → URL ký ≤ 60 s (cần READY, chưa READY → 409 CONTRIB_006). Hết hạn 30 ngày → 410 CONTRIB_005. Người ngoài bảng → 404."
   *     tags: [Contribution]
   *     security: [{ BearerAuth: [] }]
   */
  router.post(
    "/boards/:id/contribution/export",
    ...M,
    byBoard,
    scopeLimiter("contribution-export", (req) => (req.user ? `${req.user.id}:${req.params.id}` : null), [{ max: LIMITS.contribution.exportsPerUserPerHour, windowSeconds: 3600 }]),
    validateBody(createExportSchema),
    exportController.create
  );
  router.get("/contribution-exports/:id", ...M, validateParams(exportIdParamSchema), validateQuery(exportDownloadQuerySchema), exportController.get);

  // Chặn mọi phương thức ghi còn lại tới báo cáo (đặt SAU các route GET/POST hợp lệ ở trên): 405 + `Allow: GET`, kể cả thân yêu cầu có trường lạ.
  router.all("/boards/:id/contribution", authenticateToken, methodNotAllowed(["GET"]));
  router.all("/boards/:id/contribution/members/*", authenticateToken, methodNotAllowed(["GET"]));

  return router;
}

const router = createContributionRouter();

// Loại thông báo `contribution.export-*` + quyền đọc asset `CONTRIBUTION_EXPORT` (side-effect lúc import, giống `study.routes.ts`).
registerContributionModule();

export default router;
