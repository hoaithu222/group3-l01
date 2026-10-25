/** Khoá cache của biên bản & ghi hình (app.md p2-06 §4.1) — mọi tham số ảnh hưởng kết quả nằm trong khoá. */
export const recapKeys = {
  all: ['meetings', 'recap'] as const,
  detail: (meetingId: string) => ['meetings', 'recap', meetingId] as const,
};

export const recordingKeys = {
  detail: (recordingId: string) => ['meetings', 'recording', recordingId] as const,
  list: (meetingId: string) => ['meetings', 'recordings', meetingId] as const,
};

/**
 * Khoá chi tiết cuộc họp của `features/meetings` (p2-04) — viết LITERAL thay vì import (không import chéo feature, cùng cách
 * `meeting-room.keys.ts`). Công bố biên bản/bản ghi sẵn sàng đổi `hasPublishedRecap`/`readyRecordingCount`/`myActions` của chi tiết.
 */
export const MEETINGS_DETAIL_KEY = (meetingId: string) => ['meetings', 'detail', meetingId] as const;
