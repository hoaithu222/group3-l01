/**
 * Tên sự kiện Socket.IO — chép NGUYÊN VĂN enum server (`docs/plan/config-be.md §7`).
 *
 * `const` object thay vì TS `enum` (quy ước base — xem `docs/rules/code-style.md`).
 * Đây là "package chia sẻ" tạm thời giữa admin và BE cho tới khi có generator
 * từ Swagger `x-socket-events` (ghi chú ở `config-admin.md §5.2`) — đổi tên sự
 * kiện ở BE thì phải tự tay đối chiếu lại bảng này.
 */
export const SocketEvent = {
  // ── Server → client ────────────────────────────────────────────────────
  USER_CONNECTED: 'user:connected',
  PERMISSION_REVOKED: 'permission:revoked',
  /** S→C: `{ v, keys, version }` — admin vừa sửa `SystemConfig` (gộp 2 s); client làm mới `/capabilities`. */
  CONFIG_UPDATED: 'config:updated',
  /** S→C: `{ v, exp }` — còn ~60s là access token hết hạn; client chưa `auth:refresh` thì BE tự đá (p0-03). */
  SESSION_EXPIRING: 'session:expiring',
  /**
   * S→C phòng `admin:ops` (p0-03): `{ v, socketConnections, onlineUsers, serverNow }` — cron BE `ops.stats-broadcast` (30 s, chỉ khi có admin
   * ở phòng). Vào phòng bằng `room:join { kind: 'admin', id: 'ops' }` (guard `dashboard:view`). Admin lắng ở
   * `features/dashboard/hooks/useOpsStatsSocket.ts` và vá thẳng vào cache `GET /admin/overview` (không refetch).
   */
  OPS_STATS: 'ops:stats',
  NOTIFICATION_CREATED: 'notification:created',
  READ_UPDATED: 'read:updated',
  PRESENCE_UPDATED: 'presence:updated',
  MESSAGE_CREATED: 'message:created',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',
  THREAD_UPDATED: 'thread:updated',
  REACTION_UPDATED: 'reaction:updated',
  PIN_UPDATED: 'pin:updated',
  CHANNEL_CREATED: 'channel:created',
  CHANNEL_UPDATED: 'channel:updated',
  CHANNEL_ARCHIVED: 'channel:archived',
  CHANNEL_GRANTED: 'channel:granted',
  CHANNEL_REVOKED: 'channel:revoked',
  MEMBER_UPDATED: 'member:updated',
  WORKSPACE_UPDATED: 'workspace:updated',
  WORKSPACE_ARCHIVED: 'workspace:archived',
  TYPING: 'typing',
  BOARD_UPDATED: 'board:updated',
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_MOVED: 'task:moved',
  TASK_DELETED: 'task:deleted',
  TASK_ACTIVITY: 'task:activity',
  REVIEW_REQUESTED: 'review:requested',
  QUIZ_LOBBY: 'quiz:lobby',
  QUIZ_QUESTION: 'quiz:question',
  QUIZ_REVEAL: 'quiz:reveal',
  QUIZ_LEADERBOARD: 'quiz:leaderboard',
  QUIZ_ENDED: 'quiz:ended',
  CALL_UPDATED: 'call:updated',
  CALL_RECORDING: 'call:recording',
  POMODORO_UPDATED: 'pomodoro:updated',
  INTEGRATION_UPDATED: 'integration:updated',
  DOCUMENT_UPDATED: 'document:updated',
  PARTNER_ORDER: 'partner:order',
  GAMIFICATION_UPDATED: 'gamification:updated',
  PRINT_ORDER_UPDATED: 'print-order:updated',
  /**
   * S→C phòng `admin:moderation` (p1-08): `{ v, groupKey, targetType, reportCount }` — có báo cáo
   * mới (KHÔNG kèm nội dung). Vào phòng bằng `room:join { kind: 'admin', id: 'moderation' }`.
   */
  MODERATION_REPORT_CREATED: 'moderation:report-created',
  /** S→C phòng `admin:moderation` (p1-08): `{ v, groupKey, status, resolution }` — nhóm báo cáo vừa được xử lý. */
  MODERATION_REPORT_UPDATED: 'moderation:report-updated',
  /**
   * S→C phòng `admin:media` (p2-07): `{ v, serverNow, kind: 'MEETING' | 'CALL' | 'RECORDING', id, status }` — cuộc họp/cuộc gọi/bản ghi hình vừa đổi
   * (KHÔNG kèm nội dung); admin làm mới bảng qua REST. Vào phòng bằng `room:join { kind: 'admin', id: 'media' }` (guard `meeting:view`).
   */
  ADMIN_MEDIA_UPDATED: 'admin:media-updated',
  /**
   * S→C `user:{studentId}` + `user:{memberId}` (mọi nhân sự ACTIVE của công ty) (p6-08): `{ v, offerId, companyId, status, threadLocked, serverNow }` — lời mời đổi trạng thái
   * (gửi, đọc, quan tâm, từ chối, thu hồi, hết hạn, khoá thread, công ty tạm ngưng). KHÔNG có tiêu đề/nội dung — cổng HR gọi REST lấy chi tiết.
   */
  OFFER_UPDATED: 'offer:updated',
  /** S→C cùng đích `offer:updated` (p6-08): `{ v, offerId, messageId, side, createdAt, serverNow }` — tin mới trong lời mời (KHÔNG nội dung — client gọi `GET /offers/:id/messages`). */
  OFFER_MESSAGE_CREATED: 'offer:message-created',
  /** S→C `user:{memberId}` (p6-08): `{ v, companyId, status, tier, serverNow }` — công ty được duyệt/từ chối/tạm ngưng/khôi phục hoặc đổi gói. */
  COMPANY_UPDATED: 'company:updated',
  /** ⏸ D-13 — Job AI tạm dừng; sự kiện giữ chỗ cho lúc bật lại. */
  AI_JOB_UPDATED: 'ai-job:updated',

  // ── Client → server ────────────────────────────────────────────────────
  TYPING_START: 'typing:start',
  PRESENCE_HEARTBEAT: 'presence:heartbeat',
  QUIZ_ANSWER: 'quiz:answer',
  CALL_SIGNAL: 'call:signal',
  /** `{ kind, id }` — KHÔNG nhận tên phòng tự do, BE tự ghép `${kind}:${id}`. */
  JOIN_ROOM: 'room:join',
  LEAVE_ROOM: 'room:leave',
  /** C→S, ack `{ok,code?}`: `{ token }` — nạp access token mới không cần reconnect (p0-03). */
  AUTH_REFRESH: 'auth:refresh',
} as const;

export type SocketEventName = (typeof SocketEvent)[keyof typeof SocketEvent];

/**
 * `connect_error.data.code` thuộc nhóm LỖI XÁC THỰC ở bước handshake (khác lỗi
 * mạng/server bận) — BE gắn `data.code` cho MỌI lỗi xác thực socket
 * (`be/src/infrastructure/socket/socket.server.ts`), luôn có tiền tố `AUTH_`
 * (`AUTH_002/003/004/011/012`…, xem `be/src/core/utils/error.codes.ts`).
 *
 * Nhóm này KHÔNG đồng nghĩa "phiên chết": xem `isRefreshableAuthCode`.
 */
export function isAuthLogoutCode(code: string | undefined): boolean {
  return typeof code === 'string' && code.startsWith('AUTH_');
}

/**
 * Trong nhóm `AUTH_*`, ba mã này chỉ nói ACCESS TOKEN dùng để bắt tay không dùng được
 * (`AUTH_002` sai/hết hạn/đã blacklist — BE dùng mã này cho cả "hết hạn", `AUTH_003`
 * hết hạn, `AUTH_004` phiên bản phiên đã đổi vì đổi vai/mật khẩu) — cookie refresh
 * vẫn có thể còn sống nên PHẢI thử làm mới trước khi kết luận phiên chết. Mọi mã còn
 * lại (`AUTH_011/012` khoá/chờ xoá, `AUTH_010` thu hồi…) là phán quyết cuối của máy chủ.
 *
 * Trường hợp thật: máy ngủ / tab nền > 15 phút rồi socket tự nối lại bằng token đã hết
 * hạn trong bộ nhớ (`session:expiring` chỉ gia hạn được khi socket đang sống). Coi đó là
 * phiên chết thì cứ mở laptop lên là bị đá ra đăng nhập dù cookie còn 7 ngày.
 */
export function isRefreshableAuthCode(code: string | undefined): boolean {
  return code === 'AUTH_002' || code === 'AUTH_003' || code === 'AUTH_004';
}
