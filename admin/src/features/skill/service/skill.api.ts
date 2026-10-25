/**
 * Đường dẫn admin kỹ năng — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). Khớp `be/src/modules/career/career.admin.routes.ts`; mọi route cần
 * cờ `career`, xem `skill:view`, tạo `skill:create`, sửa/bật tắt/thu hồi/khôi phục/đánh giá lại `skill:update` (lý do 10–500 + audit).
 */
const seg = encodeURIComponent;

export const skillApi = {
  /** GET `?page&limit&q&category&active` (kèm `holdersCount`); POST tạo (`SKILL_001`, `SKILL_002`, `SKILL_005`). */
  skills: '/admin/skills',
  /** GET chi tiết; PATCH — CAS `expectedVersion` (`RES_003`), trả thêm `criteriaHarder`. */
  skill: (id: string) => `/admin/skills/${seg(id)}`,
  /** POST `{ reason }`. */
  activate: (id: string) => `/admin/skills/${seg(id)}/activate`,
  deactivate: (id: string) => `/admin/skills/${seg(id)}/deactivate`,
  /** GET `?criteria=<json>` (tiêu chí CHƯA lưu, tuỳ chọn) → `EligiblePreview`. */
  preview: (id: string) => `/admin/skills/${seg(id)}/eligible-preview`,
  /** GET `?q=` → nhãn phổ biến (tên + số lần dùng). */
  labelSuggestions: '/admin/skills/label-suggestions',
  /** POST `{ reason }` → 202 `{ jobId, skills }`; lần 2 trong 1 giờ → 429 `SKILL_006`. */
  reevaluate: '/admin/skills/reevaluate',
  userSkills: (userId: string) => `/admin/users/${seg(userId)}/skills`,
  userProof: (userId: string, skillId: string) =>
    `/admin/users/${seg(userId)}/skills/${seg(skillId)}/proof`,
  /** POST `{ reason }` — `SKILL_003` chưa có huy hiệu. */
  revoke: (userId: string, skillId: string) =>
    `/admin/users/${seg(userId)}/skills/${seg(skillId)}/revoke`,
  /** POST `{ reason }` — `SKILL_004` chưa bị thu hồi. */
  restore: (userId: string, skillId: string) =>
    `/admin/users/${seg(userId)}/skills/${seg(skillId)}/restore`,
} as const;
