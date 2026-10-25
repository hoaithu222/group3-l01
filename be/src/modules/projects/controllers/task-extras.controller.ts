import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { ConvertChecklistItemDto, DuplicateTaskDto } from "../dtos";
import type { TaskConvertService } from "../services/task-convert.service";
import type { TaskDuplicateService } from "../services/task-duplicate.service";
import type { TaskWatchService } from "../services/task-watch.service";

const actor = (req: Request) => req.user!;

/** p3-03 P1: theo dõi thẻ, sao chép thẻ, chuyển mục checklist thành thẻ. Chỉ parse request → gọi service → trả response. */
export function createTaskExtrasController(watch: TaskWatchService, duplicate: TaskDuplicateService, convert: TaskConvertService) {
  const watchTask = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await watch.watch(actor(req), req.params.id), "Đã theo dõi thẻ");
  });
  const unwatchTask = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await watch.unwatch(actor(req), req.params.id), "Đã bỏ theo dõi thẻ");
  });
  const listWatchers = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await watch.list(actor(req), req.params.id));
  });
  const duplicateTask = catchAsync(async (req: Request, res: Response) => {
    const result = await duplicate.duplicate(actor(req), req.params.id, req.body as DuplicateTaskDto);
    // Replay idempotent (cùng `clientTaskId`) → 200 với thẻ đã có, không phải 201 tạo mới.
    ResponseUtils.success(res, result.task, result.created ? "Đã sao chép thẻ" : "Thẻ đã được sao chép trước đó", result.created ? 201 : 200);
  });
  const convertChecklistItem = catchAsync(async (req: Request, res: Response) => {
    const result = await convert.convert(actor(req), req.params.id, req.params.itemId, req.body as ConvertChecklistItemDto);
    ResponseUtils.success(res, result, result.created ? "Đã chuyển việc nhỏ thành thẻ" : "Việc nhỏ đã được chuyển trước đó", result.created ? 201 : 200);
  });
  return { watchTask, unwatchTask, listWatchers, duplicateTask, convertChecklistItem };
}
