import { z } from "zod";
import { QUEUE_NAMES } from "../../infrastructure/queue";
import { cursorQuerySchema, reasonSchema, objectIdSchema } from "../../shared/dto/common-schemas";

/** Params chung cho hành động trên 1 job cụ thể (`retry`/`remove`). */
export const queueParamSchema = z.object({
  queue: z.enum(QUEUE_NAMES),
  jobId: z.string().min(1).max(256),
});
export type QueueParam = z.infer<typeof queueParamSchema>;

/** `GET /admin/jobs/failed` — `queue` bỏ trống = gộp tất cả queue. */
export const failedJobsQuerySchema = z.object({
  queue: z.enum(QUEUE_NAMES).optional(),
  start: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type FailedJobsQuery = z.infer<typeof failedJobsQuerySchema>;

/** `GET /admin/jobs/outbox` — cursor pagination + lọc theo trạng thái/loại sự kiện. */
export const outboxQuerySchema = cursorQuerySchema.extend({
  status: z.enum(["PENDING", "DISPATCHING", "DISPATCHED", "FAILED"]).optional(),
  type: z.string().max(100).optional(),
});
export type OutboxQuery = z.infer<typeof outboxQuerySchema>;

/** Body chung cho `retry`/`remove`/`requeue` — bắt buộc lý do (hành động nhạy cảm). */
export const jobActionSchema = reasonSchema;
export type JobActionDto = z.infer<typeof jobActionSchema>;

/** Params cho `POST /admin/jobs/outbox/:id/requeue`. */
export const outboxIdParamSchema = z.object({ id: objectIdSchema });
export type OutboxIdParam = z.infer<typeof outboxIdParamSchema>;
