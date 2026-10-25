import { z } from "zod";
import { ROLE_LIST } from "../../../core/constants";

export const changeRoleSchema = z.object({
  role: z.enum(ROLE_LIST as [string, ...string[]]),
  reason: z.string().trim().min(10, "Lý do tối thiểu 10 ký tự").max(500),
});

export type ChangeRoleDto = z.infer<typeof changeRoleSchema>;
