import type { z } from "zod";
import { cursorQuerySchema } from "../../../shared/dto/common-schemas";

/**
 * p1-09 be.md §3 `pinsQuerySchema = cursorQuerySchema` — `GET .../pins?cursor=&limit=`.
 * Mặc định `limit=30` ≥ `pinMax` (20 kênh/10 hội thoại) nên client cũ (p1-04, không gửi query)
 * vẫn nhận ĐỦ mọi tin ghim trong 1 trang như trước.
 */
export const pinsQuerySchema = cursorQuerySchema;
export type PinsQueryDto = z.infer<typeof pinsQuerySchema>;
