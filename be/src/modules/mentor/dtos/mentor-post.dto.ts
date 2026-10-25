import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { cursorQuerySchema, objectIdSchema } from "../../../shared/dto/common-schemas";
import { MENTOR_POST_STATUSES } from "../entities/mentor.interface";

const L = LIMITS.mentor;

const skillSchema = z.string().trim().min(1, "Kỹ năng không được rỗng").max(L.skillMax, `Mỗi kỹ năng tối đa ${L.skillMax} ký tự`);

/** Trần CỨNG (biên dịch lúc import) — be.md §3. */
export const createPostSchema = z.object({
  title: z.string().trim().min(L.titleMin, `Tiêu đề tối thiểu ${L.titleMin} ký tự`).max(L.titleMax, `Tiêu đề tối đa ${L.titleMax} ký tự`),
  description: z
    .string()
    .trim()
    .min(L.descriptionMin, `Mô tả tối thiểu ${L.descriptionMin} ký tự`)
    .max(L.descriptionMax, `Mô tả tối đa ${L.descriptionMax} ký tự`),
  skills: z.array(skillSchema).min(1, "Cần ít nhất 1 kỹ năng").max(L.skillsMax, `Tối đa ${L.skillsMax} kỹ năng`),
  commitmentHoursPerWeek: z.number().int().min(1).max(L.commitmentHoursMax),
  mentorsNeeded: z.number().int().min(1).max(L.mentorsNeededMax).default(1),
  expiresInDays: z.number().int().min(L.expiresInDays.min).max(L.expiresInDays.max),
});
export type CreatePostDto = z.infer<typeof createPostSchema>;

export const updatePostSchema = createPostSchema
  .partial()
  .extend({ expectedVersion: z.number().int().min(1) })
  .refine((v) => Object.keys(v).some((k) => k !== "expectedVersion"), { message: "Không có trường nào để cập nhật" });
export type UpdatePostDto = z.infer<typeof updatePostSchema>;

export const listPostsQuerySchema = cursorQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  /** CSV kỹ năng, vd `react,node` — bài phải có đủ mọi kỹ năng. */
  skills: z.string().max(300).optional(),
  status: z.enum(MENTOR_POST_STATUSES).default("OPEN"),
});
export type ListPostsQueryDto = z.infer<typeof listPostsQuerySchema>;

export const postIdParamsSchema = z.object({ id: objectIdSchema });
export const workspaceParamsSchema = z.object({ workspaceId: objectIdSchema });
