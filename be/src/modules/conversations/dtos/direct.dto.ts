import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

/** be.md §3 — `POST /conversations/direct`. */
export const createDirectSchema = z.object({ userId: objectIdSchema });
export type CreateDirectDto = z.infer<typeof createDirectSchema>;

export const directUserParamSchema = z.object({ userId: objectIdSchema });
