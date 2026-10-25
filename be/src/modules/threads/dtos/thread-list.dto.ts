import { z } from "zod";

/** be.md §3 — `GET /channels/:id/threads?filter=following|all&cursor=` (P1). Giới hạn 50/mặc định 20 chốt cứng trong be.md §3, KHÔNG dùng `LIMITS.pagination` chung (khác giá trị). */
export const threadListQuerySchema = z.object({
  filter: z.enum(["following", "all"]).default("following"),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ThreadListQueryDto = z.infer<typeof threadListQuerySchema>;
