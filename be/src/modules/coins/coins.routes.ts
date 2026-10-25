import { Router } from "express";
import { apiLimiter, authenticateToken, idempotencyKey, requireFeature, scopeLimiter, validateParams, validateQuery } from "../../core/middlewares";
import { LIMITS } from "../../core/constants/limits";
import { MODULES } from "../../core/constants/modules";
import { createCoinsController } from "./controllers/coins.controller";
import { coinIdParamSchema, kindQuerySchema, txQuerySchema } from "./dtos";
import { getCoinsContainer } from "./coins.container";

/**
 * Người dùng: ví xu, lịch sử, nhiệm vụ ngày, cửa hàng, kho đồ (p7-02 be.md §4). Path tuyệt đối, mount ở root v1. Mọi route: đăng nhập → cờ `coins` (tắt → 404 `CFG_005`) → rate limit theo user. Không có endpoint nào
 * cộng/chuyển xu hay xem ví người khác — số dư chỉ đổi qua sổ cái (thưởng sự kiện ở worker, nhận nhiệm vụ, mua vật phẩm, điều chỉnh của admin). Tiền ẢO, không nạp/quy đổi tiền thật.
 */
const router = Router();
const c = getCoinsContainer();
const controller = createCoinsController({ wallet: c.walletQuery, quests: c.quests, shop: c.shop });

const guard = [authenticateToken, requireFeature(MODULES.COINS), apiLimiter];
const byUser = (req: { user?: { id: string } }) => req.user?.id ?? null;
const perMinute = (name: string, max: number) => scopeLimiter(name, byUser, [{ max, windowSeconds: 60 }]);

/**
 * @openapi
 * /me/wallet:
 *   get:
 *     summary: Ví xu của tôi { balance, lifetimeEarned, lifetimeSpent, todayEarned, dailyCap } (chưa từng có xu → số 0, không tạo ví khi đọc)
 *     tags: [Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: WalletDto }
 */
router.get("/me/wallet", ...guard, controller.wallet);

/**
 * @openapi
 * /me/wallet/transactions:
 *   get:
 *     summary: Lịch sử xu của tôi (cursor mới → cũ; lọc type) — sổ cái append-only, mỗi dòng có balanceAfter
 *     tags: [Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "data: [{ id, type, amount, balanceAfter, refType, refId, at }], meta: { nextCursor, hasMore, limit }" }
 */
router.get("/me/wallet/transactions", ...guard, validateQuery(txQuerySchema), controller.transactions);

/**
 * @openapi
 * /me/quests:
 *   get:
 *     summary: Nhiệm vụ ngày của tôi (ngày theo múi giờ của tôi) [{ quest, progress, target, claimable, claimedAt }]
 *     tags: [Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "QuestDto[]" }
 */
router.get("/me/quests", ...guard, controller.quests);

/**
 * @openapi
 * /me/quests/{id}/claim:
 *   post:
 *     summary: Nhận thưởng nhiệm vụ HÔM NAY (bấm chủ động, Idempotency-Key tuỳ chọn; giới hạn 20 lần/phút). COIN_004 đã nhận, COIN_005 chưa hoàn thành
 *     tags: [Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ balance, delta }" }
 */
router.post("/me/quests/:id/claim", ...guard, validateParams(coinIdParamSchema), idempotencyKey("quest-claim"), perMinute("coins-claim", LIMITS.coins.claimPerMinute), controller.claimQuest);

/**
 * @openapi
 * /shop/items:
 *   get:
 *     summary: Vật phẩm hồ sơ ĐANG bán (bật + trong khung thời gian) kèm owned/equipped/inventoryId; lọc kind
 *     tags: [Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "ShopItemListDto[]" }
 */
router.get("/shop/items", ...guard, validateQuery(kindQuerySchema), controller.shopItems);

/**
 * @openapi
 * /shop/items/{id}/buy:
 *   post:
 *     summary: Mua vật phẩm bằng xu (Idempotency-Key BẮT BUỘC; 10 lần/phút). COIN_001 thiếu xu (ví không đổi), COIN_002 đã sở hữu, COIN_003 không còn bán
 *     tags: [Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: "{ balance, inventoryItem }" }
 */
router.post("/shop/items/:id/buy", ...guard, validateParams(coinIdParamSchema), idempotencyKey("shop-buy", { required: true }), perMinute("coins-buy", LIMITS.coins.buyPerMinute), controller.buy);

/**
 * @openapi
 * /me/inventory:
 *   get:
 *     summary: Kho đồ của tôi (kèm thông tin vật phẩm); lọc kind
 *     tags: [Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "InventoryDto[]" }
 */
router.get("/me/inventory", ...guard, validateQuery(kindQuerySchema), controller.inventory);

/**
 * @openapi
 * /me/inventory/{id}/equip:
 *   post:
 *     summary: Trang bị vật phẩm trong kho (tự tháo vật phẩm cùng loại; 30 lần/phút). `id` không thuộc tôi → 404
 *     tags: [Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: InventoryDto }
 * /me/inventory/{id}/unequip:
 *   post:
 *     summary: Tháo vật phẩm đang trang bị
 *     tags: [Coins]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: InventoryDto }
 */
router.post("/me/inventory/:id/equip", ...guard, validateParams(coinIdParamSchema), perMinute("coins-equip", LIMITS.coins.equipPerMinute), controller.equip);
router.post("/me/inventory/:id/unequip", ...guard, validateParams(coinIdParamSchema), perMinute("coins-equip", LIMITS.coins.equipPerMinute), controller.unequip);

export default router;
