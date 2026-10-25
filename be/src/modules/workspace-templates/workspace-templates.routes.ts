import { Router } from "express";
import {
  authenticateToken,
  apiLimiter,
  idempotencyKey,
  requireFeature,
  requirePermission,
  requireSubFeature,
  scopeLimiter,
  validateBody,
  validateParams,
} from "../../core/middlewares";
import { LIMITS } from "../../core/constants/limits";
import { MODULES, SUB_FEATURES } from "../../core/constants/modules";
import { requireWorkspaceRole } from "../../core/permission";
import { AuditService } from "../audit-log/audit-log.service";
import { createChannelCreationPort } from "../channels";
import { PrismaWorkspaceTemplateRepository } from "./workspace-templates.repo";
import { WorkspaceTemplateService } from "./workspace-templates.service";
import { createWorkspaceTemplateController } from "./workspace-templates.controller";
import {
  adminUpdateTemplateSchema,
  applyTemplateParamsSchema,
  applyTemplateSchema,
  templateCodeParamSchema,
} from "./workspace-templates.validators";

// ── DI wiring ────────────────────────────────────────────────────────────────
const service = new WorkspaceTemplateService(new PrismaWorkspaceTemplateRepository(), createChannelCreationPort(), new AuditService());
const controller = createWorkspaceTemplateController(service);

const router = Router();

const USER = [authenticateToken, requireFeature(MODULES.COMMUNICATION), requireSubFeature(SUB_FEATURES.WORKSPACE_TEMPLATES), apiLimiter] as const;

/**
 * @openapi
 * /workspace-templates:
 *   get:
 *     summary: Mẫu nhóm đang bật (Nhóm môn học / Đồ án / Nhóm tự học) kèm danh sách kênh
 *     description: Trả `[{ code, name, description, channels[{ key, name, description, type, visibility, postingPolicy, defaultSelected }] }]`.
 *     tags: [WorkspaceTemplates]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/workspace-templates", ...USER, controller.list);

/**
 * @openapi
 * /workspaces/{workspaceId}/templates/{code}/apply:
 *   post:
 *     summary: Áp mẫu cho nhóm đã có (OWNER/ADMIN) — bỏ qua kênh trùng tên, idempotent theo Idempotency-Key (bắt buộc)
 *     description: |
 *       Body `{ channelKeys[] }` (1–20 khoá của mẫu). Trả `{ createdChannels[{key,id,name}], skipped[{key, reason: NAME_EXISTS|TYPE_UNAVAILABLE}] }`.
 *       Lỗi: 404 `TPL_001` (mẫu không tồn tại/đã tắt), 409 `TPL_002` (nhóm đã lưu trữ), 409 `TPL_003` (vượt số kênh tối đa), 403 (không đủ vai trò).
 *     tags: [WorkspaceTemplates]
 *     security: [{ BearerAuth: [] }]
 */
router.post(
  "/workspaces/:workspaceId/templates/:code/apply",
  ...USER,
  requireWorkspaceRole("ADMIN"),
  idempotencyKey("tpl-apply", { required: true }),
  scopeLimiter("tpl-apply", (req) => req.user?.id ?? null, [{ max: LIMITS.workspaceTemplate.applyRatePerHour, windowSeconds: 3600 }]),
  validateParams(applyTemplateParamsSchema),
  validateBody(applyTemplateSchema),
  controller.apply
);

/**
 * @openapi
 * /admin/workspace-templates:
 *   get:
 *     summary: Mọi mẫu nhóm (cả đã tắt) — admin
 *     tags: [WorkspaceTemplates]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/admin/workspace-templates", authenticateToken, requirePermission("system-config:view"), controller.adminList);

/**
 * @openapi
 * /admin/workspace-templates/{code}:
 *   get:
 *     summary: Chi tiết một mẫu nhóm — admin
 *     tags: [WorkspaceTemplates]
 *     security: [{ BearerAuth: [] }]
 */
router.get(
  "/admin/workspace-templates/:code",
  authenticateToken,
  requirePermission("system-config:view"),
  validateParams(templateCodeParamSchema),
  controller.adminGet
);

/**
 * @openapi
 * /admin/workspace-templates/{code}:
 *   put:
 *     summary: Sửa mẫu nhóm (tên, mô tả, bật/tắt, thứ tự, kênh) — expectedVersion + reason bắt buộc, có audit; chỉ áp cho nhóm tạo sau
 *     tags: [WorkspaceTemplates]
 *     security: [{ BearerAuth: [] }]
 */
router.put(
  "/admin/workspace-templates/:code",
  authenticateToken,
  requirePermission("system-config:update"),
  validateParams(templateCodeParamSchema),
  validateBody(adminUpdateTemplateSchema),
  controller.adminUpdate
);

export default router;
