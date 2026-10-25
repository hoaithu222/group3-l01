import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AddDependencyDto, GanttQueryDto, ReschedulePreviewDto } from "../dtos";
import type { DependencyService } from "../services/dependency.service";
import type { GanttService } from "../services/gantt.service";
import type { RescheduleService } from "../services/reschedule.service";

const actor = (req: Request) => req.user!;

/** p4-04: phụ thuộc giữa thẻ — list/add (201 mới, 200 đã có)/remove (204 kể cả khi không có cạnh). */
export function createTaskDependencyController(dependencies: DependencyService, reschedule: RescheduleService, gantt: GanttService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await dependencies.list(actor(req), req.params.id));
  });
  const add = catchAsync(async (req: Request, res: Response) => {
    const { predecessorId } = req.body as AddDependencyDto;
    const { dependency, created } = await dependencies.add(actor(req), req.params.id, predecessorId);
    ResponseUtils.success(res, dependency, created ? "Đã thêm phụ thuộc" : "Phụ thuộc đã tồn tại", created ? 201 : 200);
  });
  const remove = catchAsync(async (req: Request, res: Response) => {
    await dependencies.remove(actor(req), req.params.id, req.params.predecessorId);
    res.status(204).send();
  });
  /** Chỉ đọc — không khoá, không ghi. */
  const reschedulePreview = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await reschedule.preview(actor(req), req.params.id, req.body as ReschedulePreviewDto));
  });
  const boardGantt = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await gantt.get(actor(req), req.params.id, req.query as unknown as GanttQueryDto));
  });
  return { list, add, remove, reschedulePreview, boardGantt };
}
