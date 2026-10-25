import type { Href } from 'expo-router';

/**
 * Đường dẫn các màn nghề nghiệp (app.md p6-06 §1) — nằm trong ngăn xếp của tab Tôi (`app/(app)/me/career/*`). Huy hiệu của người khác cũng ở
 * đây (`people/[userId]`) thay vì `(app)/users/…`: một thư mục mới cấp `(app)/` sẽ bị Expo Router tự sinh thành TAB (xem `module-registry.ts`).
 *
 * ⚠️ Ép `as Href` vì route mới chưa chắc có trong `.expo/types/router.d.ts` (sinh lúc `expo start`) — chuỗi thật luôn đúng.
 */
export const CAREER_HREF = '/me/career' as Href;
export const SKILLS_HREF = '/me/career/skills' as Href;

export const skillHref = (skillId: string): Href => `/me/career/skills/${encodeURIComponent(skillId)}` as Href;

export const userSkillsHref = (userId: string): Href => `/me/career/people/${encodeURIComponent(userId)}` as Href;
