import { Router, type NextFunction, type Request, type Response } from "express";
import { apiLimiter, authenticateToken, requireFeature, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { ScopeNotFoundError } from "../../core/exceptions";
import { catchAsync } from "../../core/utils/catchAsync";
import { permissionService, requireWorkspaceRole } from "../../core/permission";
import { createScanController } from "./controllers/scan.controller";
import { createReportController } from "./controllers/report.controller";
import {
  createScanSchema,
  eligibleResourcesQuerySchema,
  listScansQuerySchema,
  scanIdParamSchema,
  sectionContextParamSchema,
  sectionsQuerySchema,
  targetSectionsParamSchema,
} from "./dtos/scan.dto";
import { getPlagiarismContainer } from "./plagiarism.container";

/**
 * `/workspaces/:workspaceId/plagiarism/*` + `/plagiarism/scans/*` (be.md §4). Path tuyệt đối, mount ở root v1. Mọi route:
 * đăng nhập → cờ `plagiarism` (tắt → 404 `CFG_005`) → rate limit chung. Route theo `:workspaceId` dùng `requireWorkspaceRole("ADMIN")`
 * (OWNER/ADMIN); route theo `:scanId` (không có `:workspaceId` trong path) dùng `scanAccessGuard` — tải scan rồi kiểm lại
 * vai trò workspace của nó, 404 trung tính nếu không đạt (be.md §4 "ScanAccessGuard").
 */
const router = Router();
const c = getPlagiarismContainer();
const scanController = createScanController({ scans: c.scanService });
const reportController = createReportController({ reports: c.reportService });

const guard = [authenticateToken, requireFeature(MODULES.PLAGIARISM), apiLimiter];
const byUser = (req: Request) => req.user?.id ?? null;
const byWorkspace = (req: Request) => req.params.workspaceId ?? null;

/** Tải scan (chưa xoá mềm) → kiểm lại vai trò workspace ADMIN/OWNER HIỆN TẠI — 404 trung tính nếu không đạt. */
function scanAccessGuard() {
  return catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
    const { scanId } = req.params;
    const scan = await c.scans.findById(scanId);
    if (!scan || scan.deletedAt) throw new ScopeNotFoundError();
    const access = await permissionService.resolve(req.user!, { type: "WORKSPACE", id: scan.workspaceId });
    if (!access.visible || (access.role !== "ADMIN" && access.role !== "OWNER")) throw new ScopeNotFoundError();
    req.access = { ...(req.access ?? {}), WORKSPACE: access };
    next();
  });
}

/**
 * @openapi
 * /workspaces/{workspaceId}/plagiarism/eligible-resources:
 *   get:
 *     summary: Tệp đủ điều kiện chọn khi tạo lượt quét (tên, đuôi, kích thước, trạng thái lập chỉ mục)
 *     tags: [Plagiarism]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "cursor [{ resourceId, name, extension, size, kind, fingerprintStatus, truncated }]" }
 */
router.get(
  "/workspaces/:workspaceId/plagiarism/eligible-resources",
  ...guard,
  requireWorkspaceRole("ADMIN"),
  validateQuery(eligibleResourcesQuerySchema),
  scanController.eligibleResources
);

/**
 * @openapi
 * /workspaces/{workspaceId}/plagiarism/scans:
 *   post:
 *     summary: Tạo lượt quét trùng lặp (1–50 tệp; WITHIN_SELECTION cần ≥ 2). Idempotency-Key tuỳ chọn.
 *     tags: [Plagiarism]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       202: { description: "{ scanId, status: QUEUED, expiresAt }" }
 *   get:
 *     summary: Danh sách lượt quét của nhóm (cursor, lọc trạng thái)
 *     tags: [Plagiarism]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "cursor scan[]" }
 */
router.post(
  "/workspaces/:workspaceId/plagiarism/scans",
  ...guard,
  requireWorkspaceRole("ADMIN"),
  // Chặn bão request THÔ (không phải hạn mức nghiệp vụ — hạn mức thật/động theo `SystemConfig` nằm trong `scan.service.create`, PLAG_004).
  scopeLimiter("plagiarism-scan", byWorkspace, [{ max: 30, windowSeconds: 60 }]),
  validateBody(createScanSchema),
  scanController.create
);
router.get("/workspaces/:workspaceId/plagiarism/scans", ...guard, requireWorkspaceRole("ADMIN"), validateQuery(listScansQuerySchema), scanController.list);

/**
 * @openapi
 * /plagiarism/scans/{scanId}:
 *   get:
 *     summary: Chi tiết 1 lượt quét + myActions (cancel/delete/export) + serverNow
 *     tags: [Plagiarism]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: scan }
 */
router.get("/plagiarism/scans/:scanId", ...guard, validateParams(scanIdParamSchema), scanAccessGuard(), scanController.getOne);

/**
 * @openapi
 * /plagiarism/scans/{scanId}/report:
 *   get:
 *     summary: Báo cáo lượt quét — { scan, disclaimer, results, pairs? } (pairs chỉ khi WITHIN_SELECTION)
 *     tags: [Plagiarism]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: ReportDto }
 */
router.get("/plagiarism/scans/:scanId/report", ...guard, validateParams(scanIdParamSchema), scanAccessGuard(), reportController.report);

/**
 * @openapi
 * /plagiarism/scans/{scanId}/targets/{resourceId}/sections:
 *   get:
 *     summary: Đoạn trùng của MỘT tệp đích (cursor, lọc theo nguồn)
 *     tags: [Plagiarism]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "cursor section[]" }
 */
router.get(
  "/plagiarism/scans/:scanId/targets/:resourceId/sections",
  ...guard,
  validateParams(targetSectionsParamSchema),
  scanAccessGuard(),
  validateQuery(sectionsQuerySchema),
  reportController.sections
);

/**
 * @openapi
 * /plagiarism/scans/{scanId}/sections/{sectionId}/context:
 *   get:
 *     summary: Chữ đối chiếu hai phía của MỘT đoạn trùng (kiểm lại quyền)
 *     tags: [Plagiarism]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ left: Excerpt, right: Excerpt }" }
 */
router.get(
  "/plagiarism/scans/:scanId/sections/:sectionId/context",
  ...guard,
  validateParams(sectionContextParamSchema),
  scanAccessGuard(),
  scopeLimiter("plagiarism-context", byUser, [{ max: 120, windowSeconds: 60 }]),
  reportController.context
);

/**
 * @openapi
 * /plagiarism/scans/{scanId}/cancel:
 *   post:
 *     summary: Huỷ lượt đang chạy (người yêu cầu hoặc OWNER)
 *     tags: [Plagiarism]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ status: CANCELLED }" }
 * /plagiarism/scans/{scanId}:
 *   delete:
 *     summary: Xoá lượt quét (người yêu cầu hoặc OWNER)
 *     tags: [Plagiarism]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Đã xoá }
 */
router.post("/plagiarism/scans/:scanId/cancel", ...guard, validateParams(scanIdParamSchema), scanAccessGuard(), scanController.cancel);
router.delete("/plagiarism/scans/:scanId", ...guard, validateParams(scanIdParamSchema), scanAccessGuard(), scanController.remove);

export default router;
