import { z } from "zod";
import { cursorQuerySchema } from "../../../shared/dto/common-schemas";

export const joinRequestDecisionSchema = z.object({ reason: z.string().trim().max(500).optional() });
export type JoinRequestDecisionDto = z.infer<typeof joinRequestDecisionSchema>;

export const listJoinRequestsQuerySchema = cursorQuerySchema;
