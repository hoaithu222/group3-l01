import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { BOARD_COLUMN_ID_REGEX } from "../../../core/constants/project";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

const columnIdSchema = z.string().regex(BOARD_COLUMN_ID_REGEX, "Mã cột không hợp lệ");
const uniqueIds = (max: number) =>
  z
    .array(objectIdSchema)
    .max(max)
    .default([])
    .transform((ids) => [...new Set(ids)]);

/** `overdue`/`archived`… là chuỗi "true"/"false" trong query — KHÔNG dùng `z.coerce.boolean()` (`"false"` → true). */
const boolQuery = z.enum(["true", "false"]).transform((v) => v === "true");

export const listTasksQuerySchema = z.object({
  columnId: columnIdSchema.optional(),
  assigneeId: z.union([objectIdSchema, z.literal("me")]).optional(),
  labelId: objectIdSchema.optional(),
  overdue: boolQuery.optional(),
  dueBefore: z.coerce.date().optional(),
  q: z.string().trim().min(2).max(100).optional(),
  limitPerColumn: z.coerce.number().int().min(1).max(200).default(100),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Tiêu đề bắt buộc").max(LIMITS.task.titleMax),
  /** Mặc định: cột TODO đầu tiên. */
  columnId: columnIdSchema.optional(),
  /** Đặt NGAY SAU thẻ này; mặc định cuối cột. */
  afterTaskId: objectIdSchema.optional(),
  assigneeIds: uniqueIds(LIMITS.task.assigneesMax),
  labelIds: uniqueIds(LIMITS.task.labelsPerTaskMax),
  dueDate: z.coerce.date().optional(),
  /** Khoá idempotent tạo thẻ (cùng người + bảng + khoá → trả lại thẻ đã tạo, không tạo trùng). */
  clientTaskId: z.string().min(8).max(64).optional(),
  clientMutationId: z.string().min(8).max(64).optional(),
});

/**
 * Vị trí đích: `afterTaskId` (ưu tiên) = đặt NGAY SAU thẻ đó; nếu không có thì `beforeTaskId` = NGAY TRƯỚC thẻ đó;
 * cả hai `null` = cuối cột. Server tính khoá giữa hai hàng xóm HIỆN TẠI (client không gửi `position`).
 */
export const moveTaskSchema = z.object({
  columnId: columnIdSchema,
  afterTaskId: objectIdSchema.nullable(),
  beforeTaskId: objectIdSchema.nullable(),
  expectedVersion: z.number().int().min(1),
  clientMutationId: z.string().min(8).max(64),
});

export type ListTasksQueryDto = z.infer<typeof listTasksQuerySchema>;
export type CreateTaskDto = z.infer<typeof createTaskSchema>;
export type MoveTaskDto = z.infer<typeof moveTaskSchema>;
