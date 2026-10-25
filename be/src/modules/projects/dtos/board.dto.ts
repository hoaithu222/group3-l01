import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { BOARD_COLUMN_ID_REGEX, COLUMN_KINDS } from "../../../core/constants/project";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

export const workspaceParamsSchema = z.object({ workspaceId: objectIdSchema });

/** Cột: thiếu `id` = cột mới (server sinh `c_` + 8 ký tự). Số cột/DONE kiểm ở `board-columns.validator` (chạy theo giới hạn runtime). */
export const columnSchema = z.object({
  id: z.string().regex(BOARD_COLUMN_ID_REGEX, "Mã cột không hợp lệ").optional(),
  title: z.string().trim().min(1, "Tên cột bắt buộc").max(LIMITS.board.columnTitleMax),
  kind: z.enum(COLUMN_KINDS),
  wipLimit: z.number().int().min(1).max(500).nullable().optional(),
});

export const createBoardSchema = z.object({
  name: z.string().trim().min(1, "Tên bảng bắt buộc").max(LIMITS.board.nameMax),
  description: z.string().trim().max(1000).optional(),
  columns: z.array(columnSchema).min(2).max(LIMITS.board.columnsMax).optional(),
});

export const updateBoardSchema = z
  .object({
    name: z.string().trim().min(1).max(LIMITS.board.nameMax).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    expectedVersion: z.number().int().min(1),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, { message: "Cần ít nhất một trường để cập nhật" });

export const putColumnsSchema = z.object({
  columns: z.array(columnSchema).min(2).max(LIMITS.board.columnsMax),
  expectedVersion: z.number().int().min(1),
});

/** `archived=true` → chỉ bảng đã lưu trữ; mặc định `false`. */
export const listBoardsQuerySchema = z.object({
  archived: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type ColumnInputDto = z.infer<typeof columnSchema>;
export type CreateBoardDto = z.infer<typeof createBoardSchema>;
export type UpdateBoardDto = z.infer<typeof updateBoardSchema>;
export type PutColumnsDto = z.infer<typeof putColumnsSchema>;
export type ListBoardsQueryDto = z.infer<typeof listBoardsQuerySchema>;
