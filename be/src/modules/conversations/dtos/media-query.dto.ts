import { z } from "zod";

/** be.md §3 — `GET /conversations/:id/media`. */
export const mediaQuerySchema = z.object({
  kind: z.enum(["MEDIA", "FILE", "LINK"]),
  cursor: z.string().max(200).optional(), // beforeSeq
  limit: z.coerce.number().int().min(1).max(60).default(30),
});
export type MediaQueryDto = z.infer<typeof mediaQuerySchema>;

/** be.md §3 — `GET /conversations/:id/read-receipts`. */
export const readReceiptsQuerySchema = z.object({ seq: z.coerce.number().int().min(1) });
export type ReadReceiptsQueryDto = z.infer<typeof readReceiptsQuerySchema>;
