import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CursorQuery } from "../../../shared/dto/common-schemas";
import type { CreateListingDto, ListingQueryDto, ReportListingDto, UpdateListingDto } from "../dtos";
import type { MarketplaceService } from "../services/marketplace.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** `/marketplace/*`, `/me/listings`, `/me/purchases` (p7-02 be.md §4, P1) — không có logic nghiệp vụ ở đây (chỉ đọc request → gọi service → trả response). */
export function createMarketplaceController(d: { marketplace: MarketplaceService }) {
  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await d.marketplace.list(requireUser(req).id, req.query as unknown as ListingQueryDto), "Chợ tài liệu");
  });

  const detail = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.marketplace.detail(requireUser(req).id, req.params.id));
  });

  const create = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.marketplace.create(requireUser(req), req.body as CreateListingDto), "Đã tạo tin niêm yết", 201);
  });

  const update = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.marketplace.update(requireUser(req), req.params.id, req.body as UpdateListingDto), "Đã cập nhật tin niêm yết");
  });

  const withdraw = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.marketplace.withdraw(requireUser(req), req.params.id), "Đã gỡ tin niêm yết");
  });

  const buy = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await d.marketplace.buy(requireUser(req), req.params.id), "Mua thành công", 201);
  });

  const report = catchAsync(async (req: Request, res: Response) => {
    await d.marketplace.report(requireUser(req), req.params.id, req.body as ReportListingDto);
    res.status(204).send();
  });

  const myListings = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await d.marketplace.myListings(requireUser(req).id, req.query as unknown as CursorQuery), "Tin niêm yết của tôi");
  });

  const myPurchases = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await d.marketplace.myPurchases(requireUser(req).id, req.query as unknown as CursorQuery), "Tài liệu đã mua");
  });

  return { list, detail, create, update, withdraw, buy, report, myListings, myPurchases };
}
