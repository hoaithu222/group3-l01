import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import type { AdminJobsService } from "./admin-jobs.service";
import type { QueueParam, FailedJobsQuery, OutboxQuery, JobActionDto, OutboxIdParam } from "./admin-jobs.validators";

export function createAdminJobsController(service: AdminJobsService) {
  const getQueues = catchAsync(async (_req: Request, res: Response) => {
    const queues = await service.getQueues();
    ResponseUtils.success(res, queues);
  });

  const getFailed = catchAsync(async (req: Request, res: Response) => {
    const { queue, start, limit } = req.query as unknown as FailedJobsQuery;
    const result = await service.getFailedJobs(queue, start, limit);
    ResponseUtils.success(res, result);
  });

  const retry = catchAsync(async (req: Request, res: Response) => {
    const { queue, jobId } = req.params as unknown as QueueParam;
    const { reason } = req.body as JobActionDto;
    await service.retryJob(queue, jobId, reason, req.user!.id, req.user!.role);
    ResponseUtils.success(res, { retried: true }, "Đã chạy lại job");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    const { queue, jobId } = req.params as unknown as QueueParam;
    const { reason } = req.body as JobActionDto;
    await service.removeJob(queue, jobId, reason, req.user!.id, req.user!.role);
    ResponseUtils.success(res, { removed: true }, "Đã xoá job");
  });

  const listOutbox = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as OutboxQuery;
    const result = await service.listOutbox(query);
    ResponseUtils.cursor(res, result, "Danh sách sự kiện outbox");
  });

  const requeueOutbox = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params as unknown as OutboxIdParam;
    const { reason } = req.body as JobActionDto;
    await service.requeueOutbox(id, reason, req.user!.id, req.user!.role);
    ResponseUtils.success(res, { status: "PENDING" }, "Đã yêu cầu chạy lại sự kiện outbox");
  });

  return { getQueues, getFailed, retry, remove, listOutbox, requeueOutbox };
}
