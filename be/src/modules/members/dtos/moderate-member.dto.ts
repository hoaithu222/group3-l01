import { z } from "zod";
import { reasonSchema } from "../../../shared/dto/common-schemas";

/** `reasonSchema` đã là `{ reason: string 10-500 ký tự }` — dùng thẳng, không bọc lại. */
export const moderateMemberSchema = reasonSchema;
export type ModerateMemberDto = z.infer<typeof moderateMemberSchema>;
