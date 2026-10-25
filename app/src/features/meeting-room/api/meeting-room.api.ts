/** Đường dẫn endpoint của `meeting-room` (BE `meeting-room.routes.ts`, p2-05 be.md §4). */

export const meetingRoomPath = (meetingId: string): string => `/meetings/${meetingId}`;
export const roomStartPath = (meetingId: string): string => `/meetings/${meetingId}/start`;
export const roomJoinPath = (meetingId: string): string => `/meetings/${meetingId}/join`;
export const roomLeavePath = (meetingId: string): string => `/meetings/${meetingId}/leave`;
export const roomEndPath = (meetingId: string): string => `/meetings/${meetingId}/end`;
export const roomSnapshotPath = (meetingId: string): string => `/meetings/${meetingId}/room`;
export const roomChatGroupPath = (meetingId: string): string => `/meetings/${meetingId}/chat-group`;
export const meetingAttendeesPath = (meetingId: string): string => `/meetings/${meetingId}/attendees`;

export const lobbyPath = (meetingId: string): string => `/meetings/${meetingId}/lobby`;
export const lobbyMePath = (meetingId: string): string => `/meetings/${meetingId}/lobby/me`;
export const lobbyAdmitAllPath = (meetingId: string): string => `/meetings/${meetingId}/lobby/admit-all`;
export const lobbyDecisionPath = (meetingId: string, userId: string, action: 'admit' | 'deny'): string =>
  `/meetings/${meetingId}/lobby/${userId}/${action}`;

export const roomLockPath = (meetingId: string, locked: boolean): string =>
  `/meetings/${meetingId}/${locked ? 'lock' : 'unlock'}`;
export const muteAllPath = (meetingId: string): string => `/meetings/${meetingId}/participants/mute-all`;
export const participantActionPath = (
  meetingId: string,
  userId: string,
  action: 'mute' | 'remove' | 'role',
): string => `/meetings/${meetingId}/participants/${userId}/${action}`;
export const lowerAllHandsPath = (meetingId: string): string => `/meetings/${meetingId}/hands/lower-all`;
export const transferControlPath = (meetingId: string): string => `/meetings/${meetingId}/transfer-control`;

// ── Ghi hình trong phòng (p2-06 be.md §4) ──────────────────────────────────────────────────────────────
export const recordingConsentRequestPath = (meetingId: string): string => `/meetings/${meetingId}/recordings/consent-request`;
export const recordingConsentPath = (meetingId: string): string => `/meetings/${meetingId}/recordings/consent`;
export const recordingConsentStatusPath = (meetingId: string): string => `/meetings/${meetingId}/recordings/consent-status`;
export const recordingStartPath = (meetingId: string): string => `/meetings/${meetingId}/recordings`;
export const recordingStopPath = (recordingId: string): string => `/recordings/${recordingId}/stop`;

/** Làm mới token LiveKit (p2-01) — TTL 600 s, chỉ để kết nối lại. */
export const callTokenPath = (callId: string): string => `/calls/${callId}/token`;
export const conversationPath = (conversationId: string): string => `/conversations/${conversationId}`;
