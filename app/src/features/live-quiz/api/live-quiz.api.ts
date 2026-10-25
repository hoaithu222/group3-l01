/** Đường dẫn endpoint của `live-quiz` (BE `live-quiz.routes.ts`, p5-01 be.md §3). */

export const LIVE_QUIZ_PATH = '/live-quiz';
export const LIVE_QUIZ_JOIN_PATH = '/live-quiz/join';
export const LIVE_QUIZ_HISTORY_PATH = '/me/live-quiz/history';

export const liveQuizPath = (id: string): string => `/live-quiz/${id}`;
export const liveQuizResultsPath = (id: string): string => `/live-quiz/${id}/results`;
export const liveQuizKickPath = (id: string): string => `/live-quiz/${id}/kick`;

/** Lệnh host — cùng body CAS `{ expectedVersion }`. */
export type LiveQuizCommand = 'cancel' | 'end' | 'next' | 'start';
export const liveQuizCommandPath = (id: string, command: LiveQuizCommand): string =>
  `/live-quiz/${id}/${command}`;
