/** Query key của feature nghề nghiệp (app.md p6-06 §4). */
export const careerKeys = {
  all: ['career'] as const,
  skills: () => ['career', 'skills'] as const,
  skill: (skillId: string) => ['career', 'skills', skillId] as const,
  /** ⚠️ Không đặt `'my-skills'` (app.md): chuỗi `my-…` trông như class margin → `check:classes` báo nhầm. */
  mySkills: () => ['career', 'mine'] as const,
  userSkills: (userId: string) => ['career', 'user-skills', userId] as const,
  proof: (userId: string, skillId: string) => ['career', 'proof', userId, skillId] as const,
  me: () => ['me', 'career'] as const,
};
