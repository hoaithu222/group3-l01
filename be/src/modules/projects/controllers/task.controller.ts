import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CreateTaskDto, GetTaskQueryDto, ListTasksQueryDto, MoveTaskDto, PatchTaskDto } from "../dtos";
import type { TaskDetailService } from "../services/task-detail.service";
import type { TaskMoveService } from "../services/task-move.service";
import type { TaskService } from "../services/task.service";

const actor = (req: Request) => req.user!;

export function createTaskController(tasks: TaskService, moves: TaskMoveService, details: TaskDetailService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await tasks.list(actor(req), req.params.id, req.query as unknown as ListTasksQueryDto));
  });
  const create = catchAsync(async (req: Request, res: Response) => {
    const result = await tasks.create(actor(req), req.params.id, req.body as CreateTaskDto);
    // Replay idempotent (cùng `clientTaskId`) → 200 với thẻ đã có, không phải 201 tạo mới.
    ResponseUtils.success(res, result.task, result.created ? "Đã tạo thẻ" : "Thẻ đã được tạo trước đó", result.created ? 201 : 200);
  });
  const move = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await moves.move(actor(req), req.params.id, req.body as MoveTaskDto), "Đã di chuyển thẻ");
  });

  // ── p3-03: chi tiết thẻ ──
  const getById = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await details.get(actor(req), req.params.id, req.query as unknown as GetTaskQueryDto));
  });
  const patch = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await details.patch(actor(req), req.params.id, req.body as PatchTaskDto), "Đã cập nhật thẻ");
  });
  const remove = catchAsync(async (req: Request, res: Response) => {
    await details.remove(actor(req), req.params.id);
    res.status(204).send();
  });
  const restore = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await details.restore(actor(req), req.params.id), "Đã khôi phục thẻ");
  });
  return { list, create, move, getById, patch, remove, restore };
}
