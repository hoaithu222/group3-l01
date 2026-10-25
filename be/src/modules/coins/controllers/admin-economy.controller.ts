import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CursorQuery } from "../../../shared/dto/common-schemas";
import type { AdjustDto, CreateQuestDto, CreateShopItemDto, ListingActionDto, OverviewQueryDto, PutRuleDto, TxQueryDto, UpdateQuestDto, UpdateShopItemDto } from "../dtos";
import type { CoinSourceTypeValue, ShopItemKindValue } from "../entities/coins.interface";
import type { EconomyAdminService } from "../services/economy-admin.service";
import type { EconomyCatalogAdminService } from "../services/economy-catalog-admin.service";
import type { MarketplaceService } from "../services/marketplace.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** `/admin/economy/*` — quyền (`gamification:view|update`), cờ `coins`, `Idempotency-Key` và giới hạn tốc độ do route gắn; controller không chứa nghiệp vụ. */
export function createAdminEconomyController(d: { admin: EconomyAdminService; catalog: EconomyCatalogAdminService; marketplace: MarketplaceService }) {
  const overview = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.admin.overview((req.query as unknown as OverviewQueryDto).days), "Tổng quan kinh tế xu");
  });

  const userWallet = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.admin.userWallet(req.params.userId));
  });

  const userTransactions = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await d.admin.userTransactions(req.params.userId, req.query as unknown as TxQueryDto), "Lịch sử xu của người dùng");
  });

  const adjust = catchAsync(async (req: Request, res: Response) => {
    const key = req.header("Idempotency-Key");
    if (!key) throw new ValidationError("Thiếu Idempotency-Key");
    ResponseUtils.success(res, await d.admin.adjust(requireUser(req), req.params.userId, req.body as AdjustDto, key), "Đã điều chỉnh xu");
  });

  const listItems = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.catalog.listItems((req.query as { kind?: ShopItemKindValue }).kind), "Vật phẩm cửa hàng");
  });

  const createItem = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.catalog.createItem(requireUser(req), req.body as CreateShopItemDto), "Đã tạo vật phẩm", 201);
  });

  const updateItem = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.catalog.updateItem(requireUser(req), req.params.id, req.body as UpdateShopItemDto), "Đã cập nhật vật phẩm");
  });

  const listRules = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, await d.catalog.listRules(), "Luật thưởng xu");
  });

  const putRule = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.catalog.putRule(requireUser(req), req.params.sourceType as CoinSourceTypeValue, req.body as PutRuleDto), "Đã lưu luật");
  });

  const listQuests = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, await d.catalog.listQuests(), "Nhiệm vụ ngày");
  });

  const createQuest = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.catalog.createQuest(requireUser(req), req.body as CreateQuestDto), "Đã tạo nhiệm vụ", 201);
  });

  const updateQuest = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.catalog.updateQuest(requireUser(req), req.params.id, req.body as UpdateQuestDto), "Đã cập nhật nhiệm vụ");
  });

  const listPendingListings = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await d.marketplace.adminListPending(req.query as unknown as CursorQuery), "Tin niêm yết chờ duyệt");
  });

  const listReportedListings = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await d.marketplace.adminListReported(req.query as unknown as CursorQuery), "Tin niêm yết bị báo cáo");
  });

  const approveListing = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.marketplace.adminApprove(requireUser(req), req.params.id, (req.body as ListingActionDto).reason), "Đã duyệt tin niêm yết");
  });

  const rejectListing = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.marketplace.adminReject(requireUser(req), req.params.id, (req.body as ListingActionDto).reason), "Đã từ chối tin niêm yết");
  });

  const hideListing = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.marketplace.adminHide(requireUser(req), req.params.id, (req.body as ListingActionDto).reason), "Đã ẩn tin niêm yết");
  });

  const restoreListing = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.marketplace.adminRestore(requireUser(req), req.params.id, (req.body as ListingActionDto).reason), "Đã khôi phục tin niêm yết");
  });

  return {
    overview,
    userWallet,
    userTransactions,
    adjust,
    listItems,
    createItem,
    updateItem,
    listRules,
    putRule,
    listQuests,
    createQuest,
    updateQuest,
    listPendingListings,
    listReportedListings,
    approveListing,
    rejectListing,
    hideListing,
    restoreListing,
  };
}
