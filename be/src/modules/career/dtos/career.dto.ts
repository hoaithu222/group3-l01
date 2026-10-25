import { z } from "zod";

/** `PUT /me/career/visibility` (be.md §3). `appearInOthersPortfolios` (p6-07, đồng bộ chéo #11) tuỳ chọn — vắng = giữ nguyên. */
export const careerVisibilitySchema = z
  .object({
    showSkills: z.boolean(),
    proofTitles: z.boolean(),
    showContribution: z.boolean(),
    showQuiz: z.boolean(),
    appearInOthersPortfolios: z.boolean().optional(),
  })
  .strict();
export type CareerVisibilityDto = z.infer<typeof careerVisibilitySchema>;
