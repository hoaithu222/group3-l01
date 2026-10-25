import { z } from "zod";
import { paginationSchema } from "../../../shared/dto/common-schemas";

const STATUSES = ["SCHEDULED", "LIVE", "ENDED", "CANCELLED"] as const;

/** Trần dòng/trang của bảng admin (admin.md p2-04 §2.1: 20 dòng/trang) — nhỏ hơn trần chung 100 vì mỗi dòng còn ghép tên chủ trì. */
const ADMIN_LIST_LIMIT_MAX = 50;

/** `?status=SCHEDULED,LIVE` hoặc lặp `?status=…&status=…` (cùng dạng `csvEnum` của p2-07). */
const statusFilter = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]).flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.enum(STATUSES)).max(STATUSES.length))
  .optional();

/**
 * `GET /admin/workspaces/:workspaceId/meetings` (admin.md p2-04 §2.1) — phân trang + lọc trạng thái + khoảng thời gian BẮT ĐẦU
 * (`startAt ∈ [from, to]`). Không nhận `q`/`userId`/`sort` — admin chỉ xem metadata, luôn `startAt` mới → cũ.
 */
export const adminWorkspaceMeetingsQuerySchema = paginationSchema
  .extend({
    limit: z.coerce.number().int().min(1).max(ADMIN_LIST_LIMIT_MAX).default(20),
    status: statusFilter,
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((q) => !q.from || !q.to || q.to >= q.from, { message: "Khoảng thời gian không hợp lệ", path: ["to"] });
export type AdminWorkspaceMeetingsQueryDto = z.infer<typeof adminWorkspaceMeetingsQuerySchema>;
