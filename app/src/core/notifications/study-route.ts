import type { Href } from 'expo-router';

import type { NotificationTarget } from './notification-target.types';

/**
 * Học (p4-02): nhắc ôn hằng ngày → phiên ôn; bài thi tự nộp → kết quả lượt đó (thiếu `attemptId` thì `null` → hộp thư).
 * Tách khỏi `notification-route.ts` để file đó giữ trong trần độ dài (cùng vai `contribution-route.ts`).
 */
export function isStudyType(type: string): boolean {
  return type === 'study.sr-due-reminder' || type === 'study.mock-auto-submitted';
}

export function studyHref({ attemptId, type }: NotificationTarget): Href | null {
  if (type === 'study.sr-due-reminder') return '/study/sr';
  return attemptId ? { params: { attemptId }, pathname: '/study/results/[attemptId]' } : null;
}
