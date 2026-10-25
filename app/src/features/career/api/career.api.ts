/**
 * Đường dẫn endpoint nghề nghiệp (p6-06 be.md §4; `be/src/modules/career/career.routes.ts`) — nối sau `appConfig.apiBaseUrl`. Mọi route BE đều
 * sau `requireFeature(career)` ⇒ cờ tắt trả 404. ⛔ KHÔNG có endpoint tạo huy hiệu phía người dùng (CR-03).
 */
export const SKILLS_PATH = '/skills';
export const skillPath = (skillId: string) => `/skills/${encodeURIComponent(skillId)}`;
export const MY_SKILLS_PATH = '/me/skills';
export const userSkillsPath = (userId: string) => `/users/${encodeURIComponent(userId)}/skills`;
export const skillProofPath = (userId: string, skillId: string) =>
  `/users/${encodeURIComponent(userId)}/skills/${encodeURIComponent(skillId)}/proof`;
export const MY_CAREER_PATH = '/me/career';
export const MY_CAREER_VISIBILITY_PATH = '/me/career/visibility';
