import { z } from "zod";
import { reasonSchema } from "../../../shared/dto/common-schemas";

/** `POST /admin/workspaces/:workspaceId/remove-image` — `kind` ảnh cần gỡ + lý do (10–500 ký tự, ghi audit). */
export const adminRemoveImageSchema = reasonSchema.extend({
  kind: z.enum(["AVATAR", "COVER"]),
});

export type AdminRemoveImageDto = z.infer<typeof adminRemoveImageSchema>;
