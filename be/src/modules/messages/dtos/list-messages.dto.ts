import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { LIMITS } from "../../../core/constants/limits";

export const listMessagesQuerySchema = z
  .object({
    beforeSeq: z.coerce.number().int().min(1).optional(),
    afterSeq: z.coerce.number().int().min(0).optional(),
    around: objectIdSchema.optional(),
    threadId: objectIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(LIMITS.pagination.max).default(LIMITS.pagination.default),
  })
  .refine(
    (q) => [q.beforeSeq, q.afterSeq, q.around].filter((v) => v !== undefined).length <= 1,
    { message: "Chỉ một trong beforeSeq/afterSeq/around" }
  );
export type ListMessagesQueryDto = z.infer<typeof listMessagesQuerySchema>;

export const scopeParamsSchema = z.object({
  scopeType: z.enum(["CHANNEL", "CONVERSATION"]),
  scopeId: objectIdSchema,
});
export type ScopeParamsDto = z.infer<typeof scopeParamsSchema>;

export const messageIdParamSchema = z.object({ id: objectIdSchema });

export const reactionsListQuerySchema = z.object({
  emoji: z.string().min(1).max(32).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.pagination.max).default(LIMITS.pagination.default),
});
export type ReactionsListQueryDto = z.infer<typeof reactionsListQuerySchema>;

export const hideBodySchema = z.object({}).strict().optional();

export const deleteMessageSchema = z
  .object({ reason: z.string().trim().min(1).max(500).optional() })
  .strict()
  .optional();
export type DeleteMessageDto = z.infer<typeof deleteMessageSchema>;
