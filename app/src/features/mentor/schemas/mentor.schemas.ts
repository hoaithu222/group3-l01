import { z } from 'zod';

import { MENTOR_LIMITS as L } from '../constants/mentor.constants';

/**
 * Form Zod 4 của Mentor Connect — khớp DTO BE (`be/src/modules/mentor/dtos`), `.trim()` mọi chuỗi (bàn phím di động tự chèn
 * dấu cách sau gợi ý — `form-validation.md`). Chỉ viết `message` cho luật RIÊNG nghiệp vụ.
 */
export const mentorPostFormSchema = z.object({
  description: z
    .string()
    .trim()
    .min(L.descriptionMin, `Mô tả tối thiểu ${L.descriptionMin} ký tự`)
    .max(L.descriptionMax, `Mô tả tối đa ${L.descriptionMax} ký tự`),
  title: z
    .string()
    .trim()
    .min(L.titleMin, `Tiêu đề tối thiểu ${L.titleMin} ký tự`)
    .max(L.titleMax, `Tiêu đề tối đa ${L.titleMax} ký tự`),
});
export type MentorPostFormValues = z.infer<typeof mentorPostFormSchema>;

/** Link hồ sơ CHỈ `https` (mở bằng `WebBrowser` — app.md §6). Để trống = không gửi. */
export const applyFormSchema = z.object({
  message: z
    .string()
    .trim()
    .min(L.messageMin, `Lời nhắn tối thiểu ${L.messageMin} ký tự`)
    .max(L.messageMax, `Lời nhắn tối đa ${L.messageMax} ký tự`),
  portfolioUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === '' || /^https:\/\/[^\s]+\.[^\s]+/.test(v), {
      message: 'Link hồ sơ phải bắt đầu bằng https://',
    }),
});
export type ApplyFormValues = z.infer<typeof applyFormSchema>;

/** Thêm một kỹ năng vào danh sách chip: bỏ trùng không phân biệt hoa/thường, tối đa `skillsMax`, mỗi kỹ năng ≤ `skillMax`. */
export function addSkill(
  skills: string[],
  raw: string,
): { error: string | null; skills: string[] } {
  const label = raw.trim().replace(/\s+/g, ' ');
  if (!label) return { error: null, skills };
  if (label.length > L.skillMax) return { error: `Mỗi kỹ năng tối đa ${L.skillMax} ký tự`, skills };
  if (skills.some((s) => s.toLowerCase() === label.toLowerCase())) return { error: null, skills };
  if (skills.length >= L.skillsMax) return { error: `Tối đa ${L.skillsMax} kỹ năng`, skills };
  return { error: null, skills: [...skills, label] };
}
