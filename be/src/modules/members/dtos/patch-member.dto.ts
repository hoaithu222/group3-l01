import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";

export const patchMemberSchema = z
  .object({
    role: z.enum(["ADMIN", "MEMBER"]).optional(),
    displayName: z.string().trim().max(LIMITS.member.displayNameMax).nullable().optional(),
  })
  .refine((v) => v.role !== undefined || v.displayName !== undefined, "Không có thay đổi");
export type PatchMemberDto = z.infer<typeof patchMemberSchema>;
