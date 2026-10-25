import type { MentorApplicationStatus, MentorFeedFilter } from '../api/mentor.types';

/** Khoá React Query Mentor Connect (app.md p6-03 §4) — MỌI tham số ảnh hưởng kết quả nằm trong khoá. */
export const mentorKeys = {
  all: ['mentor'] as const,
  posts: (filter: MentorFeedFilter) => ['mentor', 'posts', filter] as const,
  post: (postId: string) => ['mentor', 'post', postId] as const,
  myApplications: () => ['mentor', 'applications-mine'] as const,
  myEngagements: () => ['mentor', 'engagements-mine'] as const,
  managedWorkspaces: () => ['mentor', 'managed-workspaces'] as const,
  ws: (wsId: string) => ['mentor', 'ws', wsId] as const,
  wsPosts: (wsId: string) => ['mentor', 'ws', wsId, 'posts'] as const,
  wsEngagements: (wsId: string) => ['mentor', 'ws', wsId, 'engagements'] as const,
  wsChannels: (wsId: string) => ['mentor', 'ws', wsId, 'channels'] as const,
  wsMembers: (wsId: string) => ['mentor', 'ws', wsId, 'members'] as const,
  applications: (postId: string, status: MentorApplicationStatus | undefined) =>
    ['mentor', 'applications', postId, status ?? 'ALL'] as const,
  applicationsOf: (postId: string) => ['mentor', 'applications', postId] as const,
};
