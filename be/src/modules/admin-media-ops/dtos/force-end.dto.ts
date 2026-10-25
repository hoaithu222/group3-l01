import { z } from "zod";
import { reasonSchema } from "../../../shared/dto/common-schemas";

/** Lý do BẮT BUỘC 10–500 ký tự (`reasonSchema`); `.strict()` — không nhận trường nào khác. */
export const forceEndSchema = reasonSchema.strict();
export type ForceEndDto = z.infer<typeof forceEndSchema>;
