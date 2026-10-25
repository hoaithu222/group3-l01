import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AddChecklistItemDto, PatchChecklistItemDto } from "../dtos";
import type { TaskChecklistService } from "../services/task-checklist.service";

const actor = (req: Request) => req.user!;

export function createTaskChecklistController(checklist: TaskChecklistService) {
  const add = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await checklist.add(actor(req), req.params.id, req.body as AddChecklistItemDto), "Đã thêm việc nhỏ", 201);
  });
  const patch = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await checklist.patch(actor(req), req.params.id, req.params.itemId, req.body as PatchChecklistItemDto), "Đã cập nhật việc nhỏ");
  });
  const remove = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await checklist.remove(actor(req), req.params.id, req.params.itemId), "Đã xoá việc nhỏ");
  });
  return { add, patch, remove };
}
