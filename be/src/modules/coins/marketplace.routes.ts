import { Router } from "express";
import { apiLimiter, authenticateToken, idempotencyKey, requireFeature, requireSystemConfig, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { cursorQuerySchema } from "../../shared/dto/common-schemas";
import { MODULES } from "../../core/constants/modules";
import { coinErrors } from "./coins.errors";
import { createMarketplaceController } from "./controllers/marketplace.controller";
import { createListingSchema, listingIdParamSchema, listingQuerySchema, reportListingSchema, updateListingSchema } from "./dtos";
import { getCoinsContainer } from "./coins.container";

/**
 * Chợ tài liệu (p7-02 be.md §4, P1) — path tuyệt đối, mount ở root v1. Mọi route: đăng nhập → cờ `coins` (tắt → 404 `CFG_005`) → rate limit theo user. Cờ RIÊNG
 * `economy.marketplaceEnabled` (mặc định TẮT — chờ điều khoản bản quyền) được kiểm THÊM ở tầng SERVICE cho MỌI thao tác đọc/ghi của module này (nghiêm hơn be.md — chỉ liệt kê ở
 * `GET /marketplace/listings` — để tránh lộ dữ liệu chợ qua đường khác khi chợ đang tắt); route `GET /marketplace/listings` gắn thêm middleware chặn sớm cho đúng bảng hợp đồng.
 *
 * `GET /me/listings` KHÔNG có trong bảng hợp đồng be.md (chỉ liệt `GET /me/purchases`) nhưng app.md cần màn "Tin của tôi" xem CẢ tin `PENDING_REVIEW`/`HIDDEN`/`WITHDRAWN` của mình
 * (`GET /marketplace/listings` công khai chỉ trả `ACTIVE`) — thêm endpoint này là quyết định của worker, xem báo cáo bàn giao.
 */
const router = Router();
const c = getCoinsContainer();
const controller = createMarketplaceController({ marketplace: c.marketplace });

const guard = [authenticateToken, requireFeature(MODULES.COINS), apiLimiter];
const byUser = (req: { user?: { id: string } }) => req.user?.id ?? null;
const marketplaceOpen = requireSystemConfig("economy.marketplaceEnabled", () => coinErrors.marketplaceDisabled());

/**
 * @openapi
 * /marketplace/listings:
 *   get:
 *     summary: Chợ tài liệu — tin ĐANG bán (ACTIVE), tìm/lọc loại/sắp xếp (mới/phổ biến/giá). COIN_008 khi chợ chưa mở
 *     tags: [Marketplace]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data: ListingDto[], meta: { nextCursor, hasMore, limit }" }
 *   post:
 *     summary: Niêm yết study set PUBLIC hoặc resource của tôi (Idempotency-Key khuyến nghị). COIN_006 nội dung không hợp lệ, COIN_007 vượt số tin tối đa, RES_002 nội dung đã có tin khác
 *     tags: [Marketplace]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: ListingDto }
 */
router.get("/marketplace/listings", ...guard, marketplaceOpen, validateQuery(listingQuerySchema), controller.list);
router.post("/marketplace/listings", ...guard, idempotencyKey("listing-create"), validateBody(createListingSchema), controller.create);

/**
 * @openapi
 * /marketplace/listings/{id}:
 *   get:
 *     summary: Chi tiết tin niêm yết + purchased + preview (≤ 3 mục với study set)
 *     tags: [Marketplace]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: ListingDetailDto }
 *   patch:
 *     summary: Người bán sửa title/description/tags/price (CAS expectedVersion). RES_003 khi lệch phiên bản
 *     tags: [Marketplace]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: ListingDto }
 *   delete:
 *     summary: Người bán gỡ tin (chuyển WITHDRAWN)
 *     tags: [Marketplace]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: ListingDto }
 */
router.get("/marketplace/listings/:id", ...guard, validateParams(listingIdParamSchema), controller.detail);
router.patch("/marketplace/listings/:id", ...guard, validateParams(listingIdParamSchema), validateBody(updateListingSchema), controller.update);
router.delete("/marketplace/listings/:id", ...guard, validateParams(listingIdParamSchema), controller.withdraw);

/**
 * @openapi
 * /marketplace/listings/{id}/buy:
 *   post:
 *     summary: Mua tài liệu bằng xu (Idempotency-Key BẮT BUỘC). COIN_001 thiếu xu, COIN_002 đã mua, COIN_006 tự mua/chợ đóng với tin này, COIN_008 chợ chưa mở
 *     tags: [Marketplace]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: "{ balance, access }" }
 */
router.post("/marketplace/listings/:id/buy", ...guard, validateParams(listingIdParamSchema), idempotencyKey("listing-buy", { required: true }), controller.buy);

/**
 * @openapi
 * /marketplace/listings/{id}/report:
 *   post:
 *     summary: Báo cáo tin niêm yết (≤ 10 lần/ngày/người) — tự ẩn khi đạt `LIMITS.marketplace.autoHideReports` lượt
 *     tags: [Marketplace]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       204: { description: Đã ghi nhận }
 */
router.post(
  "/marketplace/listings/:id/report",
  ...guard,
  validateParams(listingIdParamSchema),
  scopeLimiter("listing-report", byUser, [{ max: 10, windowSeconds: 86_400 }]),
  validateBody(reportListingSchema),
  controller.report
);

/**
 * @openapi
 * /me/listings:
 *   get:
 *     summary: Tin niêm yết của tôi (mọi trạng thái, cursor mới → cũ)
 *     tags: [Marketplace]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data: ListingDto[], meta" }
 * /me/purchases:
 *   get:
 *     summary: Tài liệu tôi đã mua (cursor mới → cũ)
 *     tags: [Marketplace]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data: PurchaseDto[], meta" }
 */
router.get("/me/listings", ...guard, validateQuery(cursorQuerySchema), controller.myListings);
router.get("/me/purchases", ...guard, validateQuery(cursorQuerySchema), controller.myPurchases);

export default router;
