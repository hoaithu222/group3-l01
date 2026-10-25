import { z } from "zod";
import { cursorQuerySchema, objectIdSchema } from "../../shared/dto/common-schemas";

/**
 * `action` nhận 1 mã hoặc NHIỀU mã ngăn bằng dấu phẩy (`user.lock,user.unlock`) —
 * UI lọc theo nhiều hành động một lúc. Chuẩn hoá về mảng đã bỏ trùng/khoảng trắng;
 * service lọc `IN`. Một mã đơn (dạng cũ) vẫn hoạt động y nguyên.
 */
const actionFilterSchema = z
  .string()
  .min(1)
  .max(1000)
  .transform((raw) => [...new Set(raw.split(",").map((a) => a.trim()).filter(Boolean))])
  .pipe(z.array(z.string().max(100)).min(1).max(30));

export const listAuditLogQuerySchema = cursorQuerySchema.extend({
  // `actorId`/`workspaceId` là `@db.ObjectId` — id sai định dạng khiến Prisma ném
  // lỗi (500); chặn ở đây để trả 400 rõ ràng.
  actorId: objectIdSchema.optional(),
  action: actionFilterSchema.optional(),
  targetType: z.string().min(1).max(100).optional(),
  targetId: z.string().min(1).optional(),
  workspaceId: objectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;
