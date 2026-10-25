import type { MeetingRangeParams } from './meetings.types';

/** Khoá cache của `meetings` (README p2-04 §4.1) — mọi tham số ảnh hưởng kết quả đều nằm trong khoá. */
export const meetingsKeys = {
  all: ['meetings'] as const,
  attendees: (meetingId: string) => ['meetings', 'attendees', meetingId] as const,
  detail: (meetingId: string) => ['meetings', 'detail', meetingId] as const,
  members: (workspaceId: string, q: string) => ['meetings', 'members', workspaceId, q] as const,
  range: (params: MeetingRangeParams) => ['meetings', 'range', params] as const,
  ranges: () => ['meetings', 'range'] as const,
  resolve: (code: string) => ['meetings', 'resolve', code] as const,
  workspaces: ['meetings', 'workspaces'] as const,
};
