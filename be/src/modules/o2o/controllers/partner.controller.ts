import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AuthUser } from "../../../core/types/express";
import type { AcceptingDto, PartnerOrdersQueryDto, PartnerRejectDto, PickupDto } from "../dtos";
import type { O2oServices } from "../o2o.services";

const me = (req: Request): AuthUser => req.user as AuthUser;

/** Chủ tiệm (audience `partner` trên admin) — mọi route đã qua `requirePermission("partner:*")`; sở hữu kiểm ở service. */
export function createPartnerController(s: O2oServices) {
  const act = (action: "ACCEPT" | "START_PRINTING" | "MARK_READY") =>
    catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.partner.act(me(req), req.params.id, action));
    });
  return {
    myShops: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.shops.myShops(me(req)));
    }),
    setAccepting: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.shops.setAccepting(me(req), req.params.id, (req.body as AcceptingDto).acceptingOrders));
    }),
    list: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.cursor(res, await s.partner.list(me(req), req.query as unknown as PartnerOrdersQueryDto));
    }),
    get: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.partner.get(me(req), req.params.id));
    }),
    accept: act("ACCEPT"),
    printing: act("START_PRINTING"),
    ready: act("MARK_READY"),
    reject: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.partner.reject(me(req), req.params.id, (req.body as PartnerRejectDto).reason));
    }),
    file: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.partner.file(me(req), req.params.id));
    }),
    pickup: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.partner.pickup(me(req), req.params.id, req.body as PickupDto), "Đã giao tài liệu");
    }),
    markPaid: catchAsync(async (req: Request, res: Response) => {
      ResponseUtils.success(res, await s.partner.markPaid(me(req), req.params.id));
    }),
  };
}
