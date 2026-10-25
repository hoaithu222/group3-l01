/**
 * Đường dẫn endpoint vận hành gọi & họp — khớp `be/src/modules/admin-media-ops/admin-media-ops.routes.ts` (p2-07).
 * Quyền: `meeting:view` xem, `meeting:update` kết thúc cưỡng bức. Cờ `meeting` tắt → 404 `CFG_005`; nhánh `/admin/calls*` cần thêm cờ `voice`.
 * Bản ghi hình (`/admin/recordings*`) dùng lại API của `features/workspace`, không khai lại ở đây.
 */
const seg = encodeURIComponent;

export const meetingApi = {
  /** GET `?page&limit&q&workspaceId&status&platform&from&to&sort`. */
  meetings: '/admin/meetings',
  meeting: (meetingId: string) => `/admin/meetings/${seg(meetingId)}`,
  /** POST `{ reason }` (10–500 ký tự) → 202 `{ accepted: true }`; 409 `MEET_009` nếu cuộc họp không còn LIVE. */
  meetingForceEnd: (meetingId: string) => `/admin/meetings/${seg(meetingId)}/force-end`,

  /** GET `?page&limit&workspaceId&meetingId&scopeType&mode&mediaKind&status&endReason&from&to&sort`. */
  calls: '/admin/calls',
  /** GET `?from&to&tz&workspaceId` — from/to bắt buộc, tối đa 92 ngày. */
  callStats: '/admin/calls/stats',
  call: (callId: string) => `/admin/calls/${seg(callId)}`,
  /** POST `{ reason }` → 202; 409 `ADMIN_MEDIA_002` (`details.meetingId`) nếu là cuộc gọi của cuộc họp; 410 `CALL_005` nếu đã kết thúc. */
  callForceEnd: (callId: string) => `/admin/calls/${seg(callId)}/force-end`,

  mediaHealth: '/admin/media/health',
} as const;
