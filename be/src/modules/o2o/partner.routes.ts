import { Router } from "express";
import {
  apiLimiter,
  authenticateToken,
  requireFeature,
  requirePermission,
  scopeLimiter,
  validateBody,
  validateParams,
  validateQuery,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { idParamSchema } from "../../shared/dto/common-schemas";
import { getO2oContainer } from "./o2o.container";
import { createPartnerController } from "./controllers/partner.controller";
import { acceptingSchema, partnerOrdersQuerySchema, partnerRejectSchema, pickupSchema } from "./dtos";
import { registerO2oModule } from "./index";

registerO2oModule();
const c = createPartnerController(getO2oContainer().services);

// Chủ tiệm: quyền THEO DỮ LIỆU `partner:*` (sở hữu PrintShop APPROVED — provider `print-shop`). Admin vận hành KHÔNG có `partner:*`.
const P = [authenticateToken, requireFeature(MODULES.O2O), apiLimiter] as const;
const view = requirePermission("partner:view");
const update = requirePermission("partner:update");
const id = validateParams(idParamSchema);
/** Chặn dò PIN XUYÊN đơn theo tài khoản tiệm (từng đơn đã có khoá 5 lần/15 phút — `PinLockout`). */
const pinLimiter = scopeLimiter("print-pin", (req) => req.user?.id ?? null, [{ max: 30, windowSeconds: 900 }]);

const router = Router();

/**
 * @openapi
 * /partner/shops/me:
 *   get: { summary: "Tiệm của tôi (trạng thái duyệt, bảng giá chỉ đọc, nhận đơn)", tags: [Partner], security: [{ BearerAuth: [] }] }
 * /partner/shops/{id}/accepting:
 *   post: { summary: "Bật/tắt nhận đơn", tags: [Partner], security: [{ BearerAuth: [] }] }
 * /partner/orders:
 *   get: { summary: "Hàng đợi đơn của tiệm tôi (status=PENDING,ACCEPTED…, cursor) — không PIN, không tệp", tags: [Partner], security: [{ BearerAuth: [] }] }
 * /partner/orders/{id}:
 *   get: { summary: "Chi tiết + dòng thời gian (tiệm khác → 404)", tags: [Partner], security: [{ BearerAuth: [] }] }
 * /partner/orders/{id}/accept:
 *   post: { summary: "Nhận đơn (PENDING → ACCEPTED)", tags: [Partner], security: [{ BearerAuth: [] }] }
 * /partner/orders/{id}/reject:
 *   post: { summary: "Từ chối (lý do)", tags: [Partner], security: [{ BearerAuth: [] }] }
 * /partner/orders/{id}/printing:
 *   post: { summary: "Bắt đầu in (ACCEPTED → PRINTING)", tags: [Partner], security: [{ BearerAuth: [] }] }
 * /partner/orders/{id}/ready:
 *   post: { summary: "Đã in xong (PRINTING → READY) — push khách", tags: [Partner], security: [{ BearerAuth: [] }] }
 * /partner/orders/{id}/file:
 *   get: { summary: "URL ký tải tệp — chỉ ACCEPTED/PRINTING (O2O_006), audit print.file-download", tags: [Partner], security: [{ BearerAuth: [] }] }
 * /partner/orders/{id}/pickup:
 *   post: { summary: "Giao hàng bằng PIN (O2O_007 kèm attemptsLeft, O2O_008 423 khi khoá)", tags: [Partner], security: [{ BearerAuth: [] }] }
 * /partner/orders/{id}/mark-paid:
 *   post: { summary: "Đánh dấu đã thu tiền tại quầy", tags: [Partner], security: [{ BearerAuth: [] }] }
 */
router.get("/partner/shops/me", ...P, view, c.myShops);
router.post("/partner/shops/:id/accepting", ...P, update, id, validateBody(acceptingSchema), c.setAccepting);
router.get("/partner/orders", ...P, view, validateQuery(partnerOrdersQuerySchema), c.list);
router.get("/partner/orders/:id", ...P, view, id, c.get);
router.post("/partner/orders/:id/accept", ...P, update, id, c.accept);
router.post("/partner/orders/:id/reject", ...P, update, id, validateBody(partnerRejectSchema), c.reject);
router.post("/partner/orders/:id/printing", ...P, update, id, c.printing);
router.post("/partner/orders/:id/ready", ...P, update, id, c.ready);
router.get("/partner/orders/:id/file", ...P, view, id, c.file);
router.post("/partner/orders/:id/pickup", ...P, update, id, pinLimiter, validateBody(pickupSchema), c.pickup);
router.post("/partner/orders/:id/mark-paid", ...P, update, id, c.markPaid);

export default router;
