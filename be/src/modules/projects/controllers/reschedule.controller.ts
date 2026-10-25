import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { RescheduleBodyDto } from "../dtos";
import type { RescheduleService } from "../services/reschedule.service";

const actor = (req: Request) => req.user!;

/** p4-04: áp dời lịch (`200` đồng bộ / `202` lô nền) + trạng thái lô. Preview nằm ở `task-dependency.controller.ts`. */
export function createRescheduleController(reschedule: RescheduleService) {
  const apply = catchAsync(async (req: Request, res: Response) => {
    const out = await reschedule.apply(actor(req), req.params.id, req.body as RescheduleBodyDto);
    if (out.status === 202) ResponseUtils.success(res, out.data, "Đã xếp lịch dời hàng loạt, sẽ báo khi xong", 202);
    else ResponseUtils.success(res, out.data, "Đã dời lịch");
  });
  const batchStatus = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await reschedule.batchStatus(actor(req), req.params.id));
  });
  return { apply, batchStatus };
}
