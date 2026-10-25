/** Khớp `be/src/core/constants/limits.ts` → `LIMITS.conversation` (be.md §9). */
export const LIMITS = {
  conversation: {
    titleMin: 1,
    titleMax: 80,
    membersMax: 200,
    memberPinnedMax: 20,
    addMembersBatchMax: 50,
    peopleSearchLimit: 20,
  },
} as const;

