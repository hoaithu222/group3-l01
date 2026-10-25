import { Router } from "express";
import { apiLimiter, authenticateToken, idempotencyKey, requireFeature, requirePermission, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { LIMITS } from "../../core/constants/limits";
import { MODULES } from "../../core/constants/modules";
import { cursorQuerySchema, idParamSchema } from "../../shared/dto/common-schemas";
import { createAdminEconomyController } from "./controllers/admin-economy.controller";
import {
  adjustSchema,
  createQuestSchema,
  createShopItemSchema,
  listingActionSchema,
  listingIdParamSchema,
  overviewQuerySchema,
  putRuleSchema,
  shopItemsQuerySchema,
  sourceTypeParamSchema,
  txQuerySchema,
  updateQuestSchema,
  updateShopItemSchema,
  userIdParamSchema,
} from "./dtos";
import { getCoinsContainer } from "./coins.container";

/**
 * Admin kinh tế xu (`/admin/economy/*`, p7-02 be.md §4) — path tuyệt đối, mount ở root v1. `gamification:view` xem, `gamification:update` ghi (manager + admin); mọi thao tác GHI bắt buộc `reason` (10–500) và ghi
 * audit (`coins.adjust`, `coins.shop-item.create|update`, `coins.rule.update`, `coins.quest.create|update`). Cờ `coins` gắn ở từng route. Điều chỉnh xu bắt buộc `Idempotency-Key` + giới hạn 60 lần/giờ/admin.
 */
const router = Router();
const c = getCoinsContainer();
const controller = createAdminEconomyController({ admin: c.admin, catalog: c.catalogAdmin, marketplace: c.marketplace });

const guard = [authenticateToken, requireFeature(MODULES.COINS), apiLimiter];
const view = requirePermission("gamification:view");
const update = requirePermission("gamification:update");
const byUser = (req: { user?: { id: string } }) => req.user?.id ?? null;

/**
 * @openapi
 * /admin/economy/overview:
 *   get:
 *     summary: Tổng quan kinh tế xu N ngày gần nhất (days 1–31, mặc định 7) { totals{issued,spent,burned,adjusted}, perDay[], circulating, topItems[], reconcile }
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: OverviewDto }
 */
router.get("/admin/economy/overview", ...guard, view, validateQuery(overviewQuerySchema), controller.overview);

/**
 * @openapi
 * /admin/economy/users/{userId}/wallet:
 *   get:
 *     summary: Ví của một người (hỗ trợ) — 404 khi người dùng không tồn tại/đã ẩn danh hoá
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: WalletDto }
 * /admin/economy/users/{userId}/transactions:
 *   get:
 *     summary: Sổ cái của một người (cursor mới → cũ, lọc type) — kèm note (lý do điều chỉnh) và actorId
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data: AdminCoinTransactionDto[], meta" }
 */
router.get("/admin/economy/users/:userId/wallet", ...guard, view, validateParams(userIdParamSchema), controller.userWallet);
router.get("/admin/economy/users/:userId/transactions", ...guard, view, validateParams(userIdParamSchema), validateQuery(txQuerySchema), controller.userTransactions);

/**
 * @openapi
 * /admin/economy/users/{userId}/adjust:
 *   post:
 *     summary: Điều chỉnh xu ± (≠ 0, ≤ 100000) — Idempotency-Key BẮT BUỘC (gửi lại không cộng hai lần), lý do 10–500, audit coins.adjust; 60 lần/giờ/admin. COIN_001 nếu làm số dư âm, COIN_009 nếu vượt mức tối đa
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ balance, delta, replayed }" }
 */
router.post(
  "/admin/economy/users/:userId/adjust",
  ...guard,
  update,
  validateParams(userIdParamSchema),
  idempotencyKey("coins-adjust", { required: true }),
  scopeLimiter("coins-adjust", byUser, [{ max: LIMITS.coins.adminAdjustPerHour, windowSeconds: 3600 }]),
  validateBody(adjustSchema),
  controller.adjust
);

/**
 * @openapi
 * /admin/economy/shop-items:
 *   get:
 *     summary: Vật phẩm cửa hàng (kể cả đang tắt) kèm số người sở hữu; lọc kind
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "AdminShopItemDto[]" }
 *   post:
 *     summary: Tạo vật phẩm (kind AVATAR_FRAME|PROFILE_THEME|EMOJI_PACK, data theo loại, giá 1–10000; lý do + audit). 409 khi trùng mã
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: AdminShopItemDto }
 * /admin/economy/shop-items/{id}:
 *   patch:
 *     summary: Sửa/tắt vật phẩm (CAS expectedVersion → RES_003; không đổi code/kind; đổi giá chỉ áp cho lần mua sau; lý do + audit trước/sau)
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: AdminShopItemDto }
 */
router.get("/admin/economy/shop-items", ...guard, view, validateQuery(shopItemsQuerySchema), controller.listItems);
router.post("/admin/economy/shop-items", ...guard, update, validateBody(createShopItemSchema), controller.createItem);
router.patch("/admin/economy/shop-items/:id", ...guard, update, validateParams(idParamSchema), validateBody(updateShopItemSchema), controller.updateItem);

/**
 * @openapi
 * /admin/economy/rules:
 *   get:
 *     summary: Luật thưởng xu theo nguồn XP kèm xu đã phát 7 ngày gần nhất (issued7d)
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "AdminRuleDto[]" }
 * /admin/economy/rules/{sourceType}:
 *   patch:
 *     summary: Tạo (expectedVersion 0) hoặc sửa luật (CAS; có hiệu lực ≤ 60 s, không hồi tố; lý do + audit coins.rule.update). ADMIN_ADJUST không có luật
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: AdminRuleDto }
 */
router.get("/admin/economy/rules", ...guard, view, controller.listRules);
router.patch("/admin/economy/rules/:sourceType", ...guard, update, validateParams(sourceTypeParamSchema), validateBody(putRuleSchema), controller.putRule);

/**
 * @openapi
 * /admin/economy/quests:
 *   get:
 *     summary: Nhiệm vụ ngày (kể cả đang tắt)
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "AdminQuestDto[]" }
 *   post:
 *     summary: Tạo nhiệm vụ (metric thuộc whitelist đếm từ xp.awarded; lý do + audit). 409 khi trùng mã
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: AdminQuestDto }
 * /admin/economy/quests/{id}:
 *   patch:
 *     summary: Sửa/tắt nhiệm vụ (CAS expectedVersion; không đổi code; lý do + audit)
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: AdminQuestDto }
 */
router.get("/admin/economy/quests", ...guard, view, controller.listQuests);
router.post("/admin/economy/quests", ...guard, update, validateBody(createQuestSchema), controller.createQuest);
router.patch("/admin/economy/quests/:id", ...guard, update, validateParams(idParamSchema), validateBody(updateQuestSchema), controller.updateQuest);

/**
 * @openapi
 * /admin/economy/listings:
 *   get:
 *     summary: Tin niêm yết đang chờ duyệt (chợ tài liệu, P1) — cursor mới → cũ
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data: ListingDto[], meta" }
 * /admin/economy/listings/{id}/approve:
 *   post:
 *     summary: Duyệt tin PENDING_REVIEW → ACTIVE (lý do + audit)
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 * /admin/economy/listings/{id}/reject:
 *   post:
 *     summary: Từ chối tin PENDING_REVIEW → WITHDRAWN (lý do + audit)
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 * /admin/economy/listings/{id}/hide:
 *   post:
 *     summary: Ẩn tin ACTIVE → HIDDEN (lý do + audit) + tự hoàn xu cho người mua trong `refundWindowDays` (moderation:update — quyền RIÊNG với xem/sửa kinh tế xu, be.md §6 ma trận quyền)
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 * /admin/economy/listings/{id}/restore:
 *   post:
 *     summary: Khôi phục tin HIDDEN → ACTIVE (lý do + audit)
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 */
router.get("/admin/economy/listings", ...guard, view, validateQuery(cursorQuerySchema), controller.listPendingListings);
/**
 * @openapi
 * /admin/economy/listings/reported:
 *   get:
 *     summary: Tin ĐANG bán/ĐÃ ẩn có báo cáo (nhiều báo cáo nhất trước) — hàng đợi kiểm duyệt chợ tài liệu (admin.md §2.3)
 *     tags: [Admin/Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data: ListingDto[], meta" }
 */
router.get("/admin/economy/listings/reported", ...guard, view, validateQuery(cursorQuerySchema), controller.listReportedListings);
router.post("/admin/economy/listings/:id/approve", ...guard, update, validateParams(listingIdParamSchema), validateBody(listingActionSchema), controller.approveListing);
router.post("/admin/economy/listings/:id/reject", ...guard, update, validateParams(listingIdParamSchema), validateBody(listingActionSchema), controller.rejectListing);
// Ẩn/khôi phục nội dung người dùng đăng = kiểm duyệt (`moderation:update`, README §6 ma trận quyền), KHÁC quyền quản lý kinh tế xu (`gamification:update`) dùng cho các route phía trên.
const moderate = requirePermission("moderation:update");
router.post("/admin/economy/listings/:id/hide", ...guard, moderate, validateParams(listingIdParamSchema), validateBody(listingActionSchema), controller.hideListing);
router.post("/admin/economy/listings/:id/restore", ...guard, moderate, validateParams(listingIdParamSchema), validateBody(listingActionSchema), controller.restoreListing);

export default router;
