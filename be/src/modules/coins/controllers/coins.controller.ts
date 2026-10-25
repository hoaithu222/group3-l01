import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { KindQueryDto, TxQueryDto } from "../dtos";
import type { CoinQuestService } from "../services/coin-quest.service";
import type { CoinWalletService } from "../services/coin-wallet.service";
import type { ShopService } from "../services/shop.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/**
 * `/me/wallet*`, `/me/quests*`, `/shop/items*`, `/me/inventory*` — người dùng chỉ thao tác trên CHÍNH mình (id lấy từ token, không từ path/body): không có endpoint nào cộng xu, chuyển xu hay
 * xem ví người khác. Không có logic nghiệp vụ ở đây (chỉ đọc request → gọi service → trả response).
 */
export function createCoinsController(d: { wallet: CoinWalletService; quests: CoinQuestService; shop: ShopService }) {
  const wallet = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.wallet.summary(requireUser(req).id));
  });

  const transactions = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await d.wallet.transactions(requireUser(req).id, req.query as unknown as TxQueryDto), "Lịch sử xu");
  });

  const quests = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.quests.listMine(requireUser(req).id), "Nhiệm vụ hôm nay");
  });

  const claimQuest = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.quests.claim(requireUser(req).id, req.params.id), "Đã nhận thưởng nhiệm vụ");
  });

  const shopItems = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.shop.list(requireUser(req).id, (req.query as unknown as KindQueryDto).kind), "Cửa hàng");
  });

  const buy = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.shop.buy(requireUser(req).id, req.params.id), "Mua thành công", 201);
  });

  const inventory = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.shop.inventory(requireUser(req).id, (req.query as unknown as KindQueryDto).kind), "Kho đồ");
  });

  const equip = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.shop.equip(requireUser(req).id, req.params.id), "Đã trang bị");
  });

  const unequip = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.shop.unequip(requireUser(req).id, req.params.id), "Đã tháo");
  });

  return { wallet, transactions, quests, claimQuest, shopItems, buy, inventory, equip, unequip };
}
