/**
 * Đường dẫn endpoint Mentor Connect (p6-03 be.md §4) — nối sau `appConfig.apiBaseUrl`.
 * `grep` một lần ở đây là thấy hết mặt tiếp xúc backend của feature.
 */

export const MENTOR_POSTS_PATH = '/mentor/posts';
export const mentorPostPath = (postId: string) => `${MENTOR_POSTS_PATH}/${postId}`;
export const mentorPostClosePath = (postId: string) => `${mentorPostPath(postId)}/close`;
export const mentorPostReportPath = (postId: string) => `${mentorPostPath(postId)}/report`;
export const mentorPostApplicationsPath = (postId: string) =>
  `${mentorPostPath(postId)}/applications`;

export const workspaceMentorPostsPath = (wsId: string) => `/workspaces/${wsId}/mentor/posts`;
export const workspaceMentorEngagementsPath = (wsId: string) =>
  `/workspaces/${wsId}/mentor/engagements`;

export const MY_MENTOR_APPLICATIONS_PATH = '/me/mentor/applications';
export const MY_MENTOR_ENGAGEMENTS_PATH = '/me/mentor/engagements';

export const mentorApplicationActionPath = (
  applicationId: string,
  action: 'accept' | 'reject' | 'withdraw',
) => `/mentor/applications/${applicationId}/${action}`;
export const mentorEngagementActionPath = (engagementId: string, action: 'end' | 'extend') =>
  `/mentor/engagements/${engagementId}/${action}`;

/** Đọc từ phân hệ khác bằng endpoint của họ (không import feature khác — `feature-structure.md`). */
export const MY_WORKSPACES_PATH = '/workspaces';
export const workspaceChannelsPath = (wsId: string) => `/workspaces/${wsId}/channels`;
export const workspaceMembersPath = (wsId: string) => `/workspaces/${wsId}/members`;
