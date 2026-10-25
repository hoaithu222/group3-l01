import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CreateLabelDto, UpdateLabelDto } from "../dtos";
import type { LabelService } from "../services/label.service";

const actor = (req: Request) => req.user!;

export function createLabelController(labels: LabelService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await labels.list(actor(req), req.params.id));
  });
  const create = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await labels.create(actor(req), req.params.id, req.body as CreateLabelDto), "Đã tạo nhãn", 201);
  });
  const update = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await labels.update(actor(req), req.params.id, req.body as UpdateLabelDto), "Đã cập nhật nhãn");
  });
  const remove = catchAsync(async (req: Request, res: Response) => {
    await labels.remove(actor(req), req.params.id);
    ResponseUtils.success(res, null, "Đã xoá nhãn");
  });
  return { list, create, update, remove };
}
