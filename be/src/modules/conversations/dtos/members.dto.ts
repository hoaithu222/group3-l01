import { z } from "zod";
import { objectIdSchema } from "../../../shared/dto/common-schemas";
import { LIMITS } from "../../../core/constants/limits";

/** be.md §3 — `POST /conversations/:id/members`. */
export const addMembersSchema = z.object({
  userIds: z.array(objectIdSchema).min(1).max(LIMITS.conversation.addMembersBatchMax),
  role: z.enum(["MEMBER", "ADMIN"]).default("MEMBER"),
});
export type AddMembersDto = z.infer<typeof addMembersSchema>;

/** be.md §3 — `PATCH /conversations/:id/members/:userId`. */
export const changeRoleSchema = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });
export type ChangeRoleDto = z.infer<typeof changeRoleSchema>;

/** be.md §3 — `POST /conversations/:id/transfer-owner`. */
export const transferOwnerSchema = z.object({ toUserId: objectIdSchema });
export type TransferOwnerDto = z.infer<typeof transferOwnerSchema>;

export const memberUserParamSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });

export const listMembersQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]).optional(),
});
export type ListMembersQueryDto = z.infer<typeof listMembersQuerySchema>;
