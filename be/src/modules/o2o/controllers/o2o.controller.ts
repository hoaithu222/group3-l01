import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AuthUser } from "../../../core/types/express";
import type {
  CancelOrderDto,
  CreateOrderDto,
  MyOrdersQueryDto,
  NearQueryDto,
  QuoteDto,
  ReviewDto,
  ReviewsQueryDto,
  UpdateOrderDto,
} from "../dtos";
import type { O2oServices } from "../o2o.services";

const me = (req: Request): AuthUser => req.user as AuthUser;

/** Người dùng (app): địa điểm, đánh giá, tiệm in, đơn in — logic ở service, controller chỉ chuyển tiếp. */
export function createO2oController(s: O2oServices) {
  return {
    near: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.locations.near(req.query as unknown as NearQueryDto));
    }),
    locationDetail: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.locations.detail(me(req), req.params.id));
    }),
    listReviews: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.cursor(res, await s.locations.listReviews(me(req), req.params.id, req.query as unknown as ReviewsQueryDto));
    }),
    putMyReview: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.locations.upsertReview(me(req), req.params.id, req.body as ReviewDto), "Đã lưu đánh giá");
    }),
    deleteMyReview: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.locations.deleteReview(me(req), req.params.id), "Đã xoá đánh giá");
    }),
    getShop: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.shops.getPublic(req.params.id));
    }),
    quote: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.shops.quote(req.params.id, req.body as QuoteDto));
    }),
    createOrder: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.orders.create(me(req), req.body as CreateOrderDto), "Đã tạo đơn in", 201);
    }),
    updateOrder: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.orders.update(me(req), req.params.id, req.body as UpdateOrderDto));
    }),
    listOrders: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.cursor(res, await s.orders.listMine(me(req), req.query as unknown as MyOrdersQueryDto));
    }),
    getOrder: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.orders.get(me(req), req.params.id));
    }),
    submitOrder: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.orderActions.submit(me(req), req.params.id), "Đã gửi đơn — giữ mã PIN để nhận tài liệu");
    }),
    regeneratePin: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.orderActions.regeneratePin(me(req), req.params.id), "Đã tạo mã PIN mới");
    }),
    cancelOrder: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.orderActions.cancel(me(req), req.params.id, req.body as CancelOrderDto), "Đã huỷ đơn");
    }),
  };
}
