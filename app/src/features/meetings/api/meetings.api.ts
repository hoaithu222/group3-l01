/** Đường dẫn endpoint của `meetings` (BE `meetings.routes.ts`, p2-04 README §5). */

export const ME_MEETINGS_PATH = '/me/meetings';
export const MY_WORKSPACES_PATH = '/workspaces';

export const workspaceMeetingsPath = (workspaceId: string): string =>
  `/workspaces/${workspaceId}/meetings`;
export const workspaceMembersPath = (workspaceId: string): string =>
  `/workspaces/${workspaceId}/members`;
export const meetingPath = (meetingId: string): string => `/meetings/${meetingId}`;
export const meetingResolvePath = (code: string): string => `/meetings/resolve/${code}`;
export const meetingCancelPath = (meetingId: string): string => `/meetings/${meetingId}/cancel`;
export const meetingAttendeesPath = (meetingId: string): string =>
  `/meetings/${meetingId}/attendees`;
export const meetingAttendeePath = (meetingId: string, userId: string): string =>
  `/meetings/${meetingId}/attendees/${userId}`;
export const meetingLeavePath = (meetingId: string): string =>
  `/meetings/${meetingId}/attendees/me`;
export const meetingRolePath = (meetingId: string, userId: string): string =>
  `/meetings/${meetingId}/attendees/${userId}/role`;
export const meetingTransferHostPath = (meetingId: string): string =>
  `/meetings/${meetingId}/transfer-host`;
export const meetingRsvpPath = (meetingId: string): string => `/meetings/${meetingId}/rsvp`;
/** `GET /meetings/:id/ics` — BE trả TỆP `text/calendar` (METHOD:PUBLISH, `Content-Disposition: attachment`), không phải JSON. Cần quyền `meeting.detail.read`. */
export const meetingIcsPath = (meetingId: string): string => `/meetings/${meetingId}/ics`;
