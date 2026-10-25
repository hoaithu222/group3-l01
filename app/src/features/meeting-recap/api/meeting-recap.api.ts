/** Đường dẫn endpoint của biên bản & ghi hình (BE `meeting-recap-recording.routes.ts`, p2-06 be.md §4). */

export const recapPath = (meetingId: string): string => `/meetings/${meetingId}/recap`;
export const recapPublishPath = (meetingId: string): string => `/meetings/${meetingId}/recap/publish`;
export const recapAttachmentsPath = (meetingId: string): string => `/meetings/${meetingId}/recap/attachments`;
export const recapAttachmentPath = (meetingId: string, assetId: string): string =>
  `/meetings/${meetingId}/recap/attachments/${assetId}`;

export const meetingRecordingsPath = (meetingId: string): string => `/meetings/${meetingId}/recordings`;
export const recordingPath = (recordingId: string): string => `/recordings/${recordingId}`;
export const recordingUrlPath = (recordingId: string): string => `/recordings/${recordingId}/url`;
export const recordingRetryPath = (recordingId: string): string => `/recordings/${recordingId}/retry-import`;
