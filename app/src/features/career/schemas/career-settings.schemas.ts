import { z } from 'zod';

import { JOB_LIMITS as L } from '../constants/recruiter.constants';

/**
 * Form Zod 4 của "Tìm việc" (app.md §3) — khớp `careerSettingsSchema` của BE (`be/src/modules/recruiter/dtos/career-settings.dto.ts`):
 * tiêu đề ≤ 120, khu vực ≤ 60. `.trim()` mọi chuỗi (bàn phím di động tự chèn dấu cách sau gợi ý). Vị trí mong muốn là chip nên xử lý ở `addRole`,
 * không nằm trong form. Để trống = `null` khi gửi (BE `.nullable()`), không gửi chuỗi rỗng.
 */
export const jobProfileSchema = z.object({
  headline: z.string().trim().max(L.headlineMax, `Tiêu đề tối đa ${L.headlineMax} ký tự`),
  location: z.string().trim().max(L.locationMax, `Khu vực tối đa ${L.locationMax} ký tự`),
});
export type JobProfileValues = z.infer<typeof jobProfileSchema>;

/** Thêm một vị trí mong muốn (chip): bỏ trùng không phân biệt hoa/thường, 2–40 ký tự, tối đa 5 vị trí (cùng `careerSettingsSchema`). */
export function addRole(roles: string[], raw: string): { error: string | null; roles: string[] } {
  const label = raw.trim().replace(/\s+/g, ' ');
  if (!label) return { error: null, roles };
  if (label.length < L.preferredRoleMin)
    return { error: `Vị trí cần ít nhất ${L.preferredRoleMin} ký tự`, roles };
  if (label.length > L.preferredRoleMax)
    return { error: `Mỗi vị trí tối đa ${L.preferredRoleMax} ký tự`, roles };
  if (roles.some((r) => r.toLowerCase() === label.toLowerCase())) return { error: null, roles };
  if (roles.length >= L.preferredRolesMax)
    return { error: `Tối đa ${L.preferredRolesMax} vị trí`, roles };
  return { error: null, roles: [...roles, label] };
}
