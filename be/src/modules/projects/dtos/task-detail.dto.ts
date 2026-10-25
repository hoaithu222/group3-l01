import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { stripHtml } from "../../../core/utils/html-sanitizer";
import { graphemeLength } from "../../../core/utils/normalize";
import { cursorQuerySchema, objectIdSchema, reasonSchema } from "../../../shared/dto/common-schemas";

/** Chuỗi đã trim, độ dài ĐẾM GRAPHEME (conventions §2); `max * 12` chặn chuỗi khổng lồ trước khi phân đoạn grapheme. */
const graphemeText = (max: number, message: string) =>
  z
    .string()
    .max(max * 12)
    .refine((s) => graphemeLength(s) <= max, message);

const dedupe = (ids: string[]): string[] => [...new Set(ids)];

/** `"true"/"false"` trong query — KHÔNG dùng `z.coerce.boolean()` (`"false"` → true). */
const boolQuery = z.enum(["true", "false"]).transform((v) => v === "true");

export const taskIdParamsSchema = z.object({ id: objectIdSchema });
export const checklistItemParamsSchema = z.object({ id: objectIdSchema, itemId: objectIdSchema });
export const taskAssetParamsSchema = z.object({ id: objectIdSchema, assetId: objectIdSchema });

export const getTaskQuerySchema = z.object({ includeDeleted: boolQuery.optional() });

/**
 * `PATCH /tasks/:id` — trường VẮNG = giữ nguyên, `null` = xoá (mô tả/ngày/điểm). Quan hệ `startDate ≤ dueDate` kiểm ở
 * service trên giá trị SAU khi gộp với bản đang lưu (chỉ gửi một ngày vẫn bị chặn nếu lệch ngày kia) → `TASK_013`.
 */
export const patchTaskSchema = z.object({
  title: z.string().trim().min(1, "Tiêu đề bắt buộc").max(LIMITS.task.titleMax).optional(),
  description: graphemeText(LIMITS.task.descriptionMax, "Mô tả quá dài").nullable().optional(),
  assigneeIds: z.array(objectIdSchema).max(LIMITS.task.assigneesMax).transform(dedupe).optional(),
  labelIds: z.array(objectIdSchema).max(LIMITS.task.labelsPerTaskMax).transform(dedupe).optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  storyPoints: z.number().int().min(0).max(LIMITS.task.storyPointsMax).nullable().optional(),
  expectedVersion: z.number().int().min(1),
  clientMutationId: z.string().min(8).max(64).optional(),
});

/**
 * ⚠️ `text` nằm trong `RAW_FIELDS` của `sanitizeInput` (giữ nguyên byte) nên middleware KHÔNG làm sạch trường này —
 * tự `stripHtml` ở đây (giữ `a < b` / `<3` như chữ thường, bỏ thẻ và nội dung script, tự trim) rồi mới kiểm độ dài.
 */
const checklistText = z
  .string()
  .max(LIMITS.task.checklistItemMax * 12)
  .transform((s) => stripHtml(s))
  .pipe(
    z
      .string()
      .min(1, "Nội dung việc nhỏ bắt buộc")
      .refine((s) => graphemeLength(s) <= LIMITS.task.checklistItemMax, "Việc nhỏ quá dài")
  );

export const addChecklistItemSchema = z.object({
  text: checklistText,
  /** Chèn NGAY SAU mục này; vắng = cuối danh sách (id không còn → cuối danh sách). */
  afterItemId: objectIdSchema.optional(),
});

export const patchChecklistItemSchema = z
  .object({
    text: checklistText.optional(),
    done: z.boolean().optional(),
    /** `null` = lên đầu; chuỗi = đặt NGAY SAU mục đó; vắng = không đổi chỗ. */
    moveAfterItemId: objectIdSchema.nullable().optional(),
  })
  .refine((v) => v.text !== undefined || v.done !== undefined || v.moveAfterItemId !== undefined, "Không có thay đổi nào");

export const attachSchema = z.object({ assetId: objectIdSchema });

const mentionSchema = z.object({ type: z.literal("USER"), targetId: objectIdSchema });
const commentContent = graphemeText(LIMITS.task.commentMax, "Bình luận quá dài");

export const createCommentSchema = z
  .object({
    clientCommentId: z.string().min(8).max(64),
    content: commentContent.default(""),
    mentions: z.array(mentionSchema).max(20).default([]),
    attachmentAssetIds: z.array(objectIdSchema).max(LIMITS.task.commentAttachmentsMax).transform(dedupe).default([]),
  })
  .refine((v) => graphemeLength(v.content.trim()) > 0 || v.attachmentAssetIds.length > 0, {
    message: "Bình luận trống",
    path: ["content"],
  });

export const patchCommentSchema = z.object({
  content: commentContent,
  mentions: z.array(mentionSchema).max(20).default([]),
  expectedVersion: z.number().int().min(1),
});

/** Xoá bình luận của NGƯỜI KHÁC bắt buộc có lý do (kiểm ở service); của mình thì tuỳ chọn. */
export const deleteCommentSchema = z.object({ reason: reasonSchema.shape.reason.optional() });

export const activityQuerySchema = cursorQuerySchema;
export const commentsQuerySchema = cursorQuerySchema;

export const mentionablesQuerySchema = z.object({ q: z.string().trim().max(50).default("") });

export type GetTaskQueryDto = z.infer<typeof getTaskQuerySchema>;
export type PatchTaskDto = z.infer<typeof patchTaskSchema>;
export type AddChecklistItemDto = z.infer<typeof addChecklistItemSchema>;
export type PatchChecklistItemDto = z.infer<typeof patchChecklistItemSchema>;
export type AttachDto = z.infer<typeof attachSchema>;
export type CreateCommentDto = z.infer<typeof createCommentSchema>;
export type PatchCommentDto = z.infer<typeof patchCommentSchema>;
export type DeleteCommentDto = z.infer<typeof deleteCommentSchema>;
export type MentionablesQueryDto = z.infer<typeof mentionablesQuerySchema>;
