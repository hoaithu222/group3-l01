import { z } from "zod";
import { reasonSchema } from "../../../shared/dto/common-schemas";

export const adminRevokeMemberSchema = reasonSchema.extend({ ban: z.boolean().default(false) });
export type AdminRevokeMemberDto = z.infer<typeof adminRevokeMemberSchema>;
