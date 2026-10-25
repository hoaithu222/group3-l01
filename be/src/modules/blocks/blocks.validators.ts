import { z } from "zod";
import { cursorQuerySchema, objectIdSchema } from "../../shared/dto/common-schemas";

/** `POST /me/blocks` (be.md p1-08 §3). */
export const blockSchema = z.object({ userId: objectIdSchema });
export type BlockDto = z.infer<typeof blockSchema>;

/** `DELETE /me/blocks/:userId`. */
export const unblockParamsSchema = z.object({ userId: objectIdSchema });

/** `GET /me/blocks`. */
export const listBlocksQuerySchema = cursorQuerySchema;
export type ListBlocksQueryDto = z.infer<typeof listBlocksQuerySchema>;
