import { z } from "zod";
import { GRANT_ROLE_REFS } from "../../../core/constants/role-coverage";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

const roleRefEnum = z.enum(GRANT_ROLE_REFS);

/** `POST /channels/:id/grants/roles` — chỉ cấp MEMBER theo vai trò (MANAGER phải đích danh). */
export const roleGrantSchema = z.object({ roleRef: roleRefEnum });
export type RoleGrantDto = z.infer<typeof roleGrantSchema>;

/** `DELETE /channels/:id/grants/roles/:roleRef`. Path đầy đủ có `channelId` — chỉ validate `roleRef`. */
export const roleRefParamSchema = z.object({ roleRef: roleRefEnum }).passthrough();
export type RoleRefParamDto = z.infer<typeof roleRefParamSchema>;

/** `GET /channels/:id/members/:userId/access`. */
export const memberAccessParamSchema = z.object({ userId: objectIdSchema }).passthrough();
