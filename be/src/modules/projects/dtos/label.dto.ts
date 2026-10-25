import { z } from "zod";
import { LABEL_COLOR_TOKENS } from "../../../core/constants/project";

export const LABEL_NAME_MAX = 30;

export const createLabelSchema = z.object({
  name: z.string().trim().min(1, "Tên nhãn bắt buộc").max(LABEL_NAME_MAX),
  color: z.enum(LABEL_COLOR_TOKENS),
});

export const updateLabelSchema = createLabelSchema
  .partial()
  .refine((v) => v.name !== undefined || v.color !== undefined, { message: "Cần ít nhất một trường để cập nhật" });

export type CreateLabelDto = z.infer<typeof createLabelSchema>;
export type UpdateLabelDto = z.infer<typeof updateLabelSchema>;
