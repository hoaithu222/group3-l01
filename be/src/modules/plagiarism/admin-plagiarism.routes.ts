import { Router } from "express";
import { authenticateToken, requirePermission, validateBody, validateQuery } from "../../core/middlewares";
import { createAdminPlagiarismController } from "./controllers/admin-plagiarism.controller";
import { adminConfigSchema, adminOverviewQuerySchema, adminReindexSchema } from "./dtos/admin.dto";
import { getPlagiarismContainer } from "./plagiarism.container";

/**
 * `/admin/plagiarism/*` (be.md §4, admin.md) — path tuyệt đối, mount ở root v1. Admin KHÔNG BAO GIỜ thấy tên tệp/nội
 * dung/điểm theo tệp của một nhóm (`admin-plagiarism.service.ts` chỉ trả số đếm/gộp). `system-config:view` xem,
 * `system-config:update` sửa cấu hình + lập chỉ mục lại (cùng quyền `PUT /system-config/*`, be.md §5.5).
 */
const router = Router();
const c = getPlagiarismContainer();
const controller = createAdminPlagiarismController({ admin: c.adminService, config: c.config });

const guard = [authenticateToken];
const view = requirePermission("system-config:view");
const update = requirePermission("system-config:update");

router.get("/admin/plagiarism/overview", ...guard, view, validateQuery(adminOverviewQuerySchema), controller.overview);
router.get("/admin/plagiarism/config", ...guard, view, controller.getConfig);
router.put("/admin/plagiarism/config", ...guard, update, validateBody(adminConfigSchema), controller.putConfig);
router.post("/admin/plagiarism/reindex", ...guard, update, validateBody(adminReindexSchema), controller.reindex);

export default router;
