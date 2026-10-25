import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";
import { objectIdSchema } from "../../../shared/dto/common-schemas";

export const addMediaSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ASSET"), assetId: objectIdSchema, group: z.string().trim().max(60).nullish(), caption: z.string().max(300).nullish() }),
  z.object({
    kind: z.literal("SVG"),
    svg: z.string().min(1).max(LIMITS.roadmap.svgMaxBytes),
    group: z.string().trim().max(60).nullish(),
    caption: z.string().max(300).nullish(),
  }),
]);
export type AddMediaDto = z.infer<typeof addMediaSchema>;

export const patchMediaSchema = z.object({
  group: z.string().trim().max(60).nullish(),
  caption: z.string().max(300).nullish(),
  order: z.number().optional(),
});
export type PatchMediaDto = z.infer<typeof patchMediaSchema>;
