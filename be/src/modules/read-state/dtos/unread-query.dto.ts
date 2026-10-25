import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

export const unreadQuerySchema = z.object({ workspaceId: objectIdSchema });
export type UnreadQueryDto = z.infer<typeof unreadQuerySchema>;
