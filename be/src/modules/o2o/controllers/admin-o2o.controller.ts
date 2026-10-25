import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AuthUser } from "../../../core/types/express";
import type {
  AdminLocationDto,
  AdminLocationUpdateDto,
  AdminLocationsQueryDto,
  AdminOrdersQueryDto,
  AdminReasonDto,
  AdminShopDto,
  AdminShopUpdateDto,
  AdminShopsQueryDto,
  ReviewsQueryDto,
} from "../dtos";
import type { O2oServices } from "../o2o.services";

const me = (req: Request): AuthUser => req.user as AuthUser;
const reason = (req: Request): string => (req.body as AdminReasonDto).reason;

function paged<T>(res: Response, result: { data: T[]; total: number }, page: number, limit: number) {
  const totalPages = Math.ceil(result.total / limit);
  ResponseUtils.paginated(res, {
    data: result.data,
    meta: { page, limit, total: result.total, totalPages, hasNext: page * limit < result.total, hasPrev: page > 1 },
  });
}

/** Vận hành O2O (`/admin/locations|print-shops|print-orders`) — quyền `o2o:*` gắn ở route. */
export function createAdminO2oController(s: O2oServices) {
  return {
    listLocations: catchAsync(async (req: Request, res: Response) => {
      const q = req.query as unknown as AdminLocationsQueryDto;
      paged(res, await s.adminLocations.list(q), q.page, q.limit);
    }),
    getLocation: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminLocations.get(me(req), req.params.id));
    }),
    createLocation: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminLocations.create(me(req), req.body as AdminLocationDto), "Đã tạo địa điểm", 201);
    }),
    updateLocation: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminLocations.update(me(req), req.params.id, req.body as AdminLocationUpdateDto));
    }),
    hideLocation: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminLocations.setHidden(me(req), req.params.id, true, reason(req)), "Đã ẩn địa điểm");
    }),
    unhideLocation: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminLocations.setHidden(me(req), req.params.id, false, reason(req)), "Đã hiện địa điểm");
    }),
    listLocationReviews: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.cursor(res, await s.adminLocations.listReviews(req.params.id, req.query as unknown as ReviewsQueryDto));
    }),
    hideReview: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminLocations.setReviewHidden(me(req), req.params.id, true, reason(req)), "Đã ẩn đánh giá");
    }),
    unhideReview: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminLocations.setReviewHidden(me(req), req.params.id, false, reason(req)), "Đã hiện đánh giá");
    }),
    listShops: catchAsync(async (req: Request, res: Response) => {
      const q = req.query as unknown as AdminShopsQueryDto;
      paged(res, await s.adminShops.list(me(req), q), q.page, q.limit);
    }),
    getShop: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminShops.get(me(req), req.params.id));
    }),
    createShop: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminShops.create(me(req), req.body as AdminShopDto), "Đã tạo tiệm in", 201);
    }),
    updateShop: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminShops.update(me(req), req.params.id, req.body as AdminShopUpdateDto));
    }),
    approveShop: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminShops.approve(me(req), req.params.id, reason(req)), "Đã duyệt tiệm");
    }),
    suspendShop: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminShops.suspend(me(req), req.params.id, reason(req)), "Đã tạm ngưng tiệm");
    }),
    listOrders: catchAsync(async (req: Request, res: Response) => {
      const q = req.query as unknown as AdminOrdersQueryDto;
      paged(res, await s.adminOrders.list(q), q.page, q.limit);
    }),
    getOrder: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminOrders.get(req.params.id));
    }),
    cancelOrder: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.adminOrders.cancel(me(req), req.params.id, reason(req)), "Đã huỷ đơn");
    }),
  };
}
