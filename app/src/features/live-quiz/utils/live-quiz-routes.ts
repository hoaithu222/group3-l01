import type { Href } from 'expo-router';

/** Đường dẫn typed của live quiz (app.md p5-01 §1) — một chỗ để đổi cây route. */
export function joinHref(pin?: string): Href {
  return pin ? { params: { pin }, pathname: '/study/live/join' } : { pathname: '/study/live/join' };
}

export function sessionHref(sessionId: string): Href {
  return { params: { sessionId }, pathname: '/study/live/[sessionId]' };
}

export function resultsHref(sessionId: string): Href {
  return { params: { sessionId }, pathname: '/study/live/[sessionId]/results' };
}

export const HISTORY_HREF: Href = '/study/live/history';

/** Tổng quan bộ học (`study`) — dựng từ ĐƯỜNG DẪN, không import feature `study` (cấm import chéo). */
export function studySetHref(setId: string): Href {
  return { params: { setId }, pathname: '/study/sets/[setId]' };
}
