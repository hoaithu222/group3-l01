import { Router } from "express";
import { authenticateToken, requirePermission, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { getO2oContainer } from "./o2o.container";
import { createAdminO2oController } from "./controllers/admin-o2o.controller";
import {
  adminLocationSchema,
  adminLocationUpdateSchema,
  adminLocationsQuerySchema,
  adminOrdersQuerySchema,
  adminReasonSchema,
  adminShopSchema,
  adminShopUpdateSchema,
  adminShopsQuerySchema,
  reviewsQuerySchema,
} from "./dtos";
import { registerO2oModule } from "./index";

registerO2oModule();
const c = createAdminO2oController(getO2oContainer().services);

// Vận hành `o2o:*` (admin/manager). KHÔNG gắn cờ `o2o`: vận hành phải chuẩn bị địa điểm/tiệm TRƯỚC khi bật cho người dùng
// (README §10 — cờ chỉ bật khi đã có ≥ 1 tiệm đối tác thật).
const A = [authenticateToken] as const;
const id = validateParams(idParamSchema);
const can = (action: "view" | "create" | "update" | "approve") => requirePermission(`o2o:${action}`);

const router = Router();

/**
 * @openapi
 * /admin/locations:
 *   get: { summary: "Địa điểm (q, type, status, amenity, phân trang)", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Tạo địa điểm (toạ độ, giờ mở, tiện ích, ảnh ≤ 8)", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 * /admin/locations/{id}:
 *   get: { summary: "Chi tiết địa điểm + ảnh + tiệm", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 *   patch: { summary: "Sửa địa điểm (expectedVersion)", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 * /admin/locations/{id}/hide:
 *   post: { summary: "Ẩn địa điểm (lý do, audit)", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 * /admin/locations/{id}/unhide:
 *   post: { summary: "Hiện lại địa điểm (lý do, audit)", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 * /admin/locations/{id}/reviews:
 *   get: { summary: "Mọi đánh giá (kể cả đã ẩn)", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 * /admin/location-reviews/{id}/hide:
 *   post: { summary: "Ẩn đánh giá vi phạm (điểm TB tính lại)", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 * /admin/location-reviews/{id}/unhide:
 *   post: { summary: "Hiện lại đánh giá", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 */
router.get("/admin/locations", ...A, can("view"), validateQuery(adminLocationsQuerySchema), c.listLocations);
router.post("/admin/locations", ...A, can("create"), validateBody(adminLocationSchema), c.createLocation);
router.get("/admin/locations/:id", ...A, can("view"), id, c.getLocation);
router.patch("/admin/locations/:id", ...A, can("update"), id, validateBody(adminLocationUpdateSchema), c.updateLocation);
router.post("/admin/locations/:id/hide", ...A, can("update"), id, validateBody(adminReasonSchema), c.hideLocation);
router.post("/admin/locations/:id/unhide", ...A, can("update"), id, validateBody(adminReasonSchema), c.unhideLocation);
router.get("/admin/locations/:id/reviews", ...A, can("view"), id, validateQuery(reviewsQuerySchema), c.listLocationReviews);
router.post("/admin/location-reviews/:id/hide", ...A, can("update"), id, validateBody(adminReasonSchema), c.hideReview);
router.post("/admin/location-reviews/:id/unhide", ...A, can("update"), id, validateBody(adminReasonSchema), c.unhideReview);

/**
 * @openapi
 * /admin/print-shops:
 *   get: { summary: "Tiệm in (status, q, phân trang) + chủ tiệm + đơn 30 ngày", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 *   post: { summary: "Tạo tiệm (PENDING) — chủ tiệm theo email (O2O_009)", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 * /admin/print-shops/{id}:
 *   get: { summary: "Chi tiết tiệm + số đơn PENDING (xác nhận tạm ngưng)", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 *   patch: { summary: "Sửa bảng giá/năng lực/nhận đơn (expectedVersion, lý do) — đơn đã gửi giữ báo giá cũ", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 * /admin/print-shops/{id}/approve:
 *   post: { summary: "Duyệt tiệm (o2o:approve) → chủ tiệm có partner:* ≤ 60 s", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 * /admin/print-shops/{id}/suspend:
 *   post: { summary: "Tạm ngưng (lý do) — đơn PENDING tự REJECTED", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 * /admin/print-orders:
 *   get: { summary: "Đơn in (shopId, status, paymentStatus, from/to, q=mã) — không PIN/tệp", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 * /admin/print-orders/{id}:
 *   get: { summary: "Chi tiết đơn + dòng thời gian", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 * /admin/print-orders/{id}/cancel:
 *   post: { summary: "Huỷ đơn khi khiếu nại (lý do, audit print.order-cancel-admin)", tags: [Admin-O2O], security: [{ BearerAuth: [] }] }
 */
router.get("/admin/print-shops", ...A, can("view"), validateQuery(adminShopsQuerySchema), c.listShops);
router.post("/admin/print-shops", ...A, can("create"), validateBody(adminShopSchema), c.createShop);
router.get("/admin/print-shops/:id", ...A, can("view"), id, c.getShop);
router.patch("/admin/print-shops/:id", ...A, can("update"), id, validateBody(adminShopUpdateSchema), c.updateShop);
router.post("/admin/print-shops/:id/approve", ...A, can("approve"), id, validateBody(adminReasonSchema), c.approveShop);
router.post("/admin/print-shops/:id/suspend", ...A, can("update"), id, validateBody(adminReasonSchema), c.suspendShop);
router.get("/admin/print-orders", ...A, can("view"), validateQuery(adminOrdersQuerySchema), c.listOrders);
router.get("/admin/print-orders/:id", ...A, can("view"), id, c.getOrder);
router.post("/admin/print-orders/:id/cancel", ...A, can("update"), id, validateBody(adminReasonSchema), c.cancelOrder);

export default router;
