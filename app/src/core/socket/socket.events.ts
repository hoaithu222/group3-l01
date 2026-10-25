/**
 * Tên sự kiện Socket.IO — NGUỒN DUY NHẤT, khớp `docs/plan/config-be.md` §7.
 *
 * ⛔ Đừng viết chuỗi sự kiện tay ở nơi gọi (`socket.on('message:created', …)`).
 * Gõ sai một ký tự trong chuỗi là `tsc` XANH (chuỗi vẫn hợp lệ) nhưng handler
 * không bao giờ chạy — không có lỗi nào báo, chỉ là tính năng "không hoạt động"
 * mà không ai lần ra vì sao. Dùng `SocketEvent.MESSAGE_CREATED` thì gõ sai là
 * lỗi TypeScript ngay tại chỗ viết.
 *
 * Nhiều sự kiện dưới đây thuộc phân hệ chưa triển khai ở Phase 0 (chat, task, quiz…) — khai đủ NGAY TỪ ĐẦU để
 * Phase 1+ chỉ việc dùng, không phải quay lại sửa file này mỗi lần mở một phân hệ mới.
 *
 * ⏸ `ai-job:updated` KHÔNG khai ở đây — mọi tính năng AI đứng ngoài tới khi
 * D-13 mở (xem `docs/plan/decisions.md`).
 */
export const SocketEvent = {
  // ── Phiên & quyền ───────────────────────────────────────────────────────
  USER_CONNECTED: 'user:connected',
  USER_DISCONNECTED: 'user:disconnected',
  /** Quyền/scope vừa bị thu hồi — xem `socket.client.ts` để biết cache nào bị xoá theo. */
  PERMISSION_REVOKED: 'permission:revoked',
  /** C→S, ack `{ok,code?}`: `{ kind, id }` — tham gia một phòng. */
  JOIN_ROOM: 'room:join',
  /** C→S, ack `{ok,code?}`: `{ kind, id }` — rời một phòng. */
  LEAVE_ROOM: 'room:leave',
  /** C→S, ack `{ok,code?}`: `{ token }` — nạp access token mới không cần reconnect. */
  AUTH_REFRESH: 'auth:refresh',
  /** S→C: `{ v, exp }` — còn ~60s là access token hết hạn, client chưa `auth:refresh` thì BE tự đá. */
  SESSION_EXPIRING: 'session:expiring',
  /** C→S, ack `{ok,code?}`: `{ dnd, until? }` — bật/tắt DND thủ công. */
  PRESENCE_SET: 'presence:set',
  /** S→C toàn bộ kết nối: `{ v, keys, configVersion, serverNow }` — cấu hình/cờ phân hệ vừa đổi (p0-07 be.md §6). Không mang giá trị: gọi lại `/capabilities`. */
  CONFIG_UPDATED: 'config:updated',

  // ── Thông báo & trạng thái đọc ──────────────────────────────────────────
  NOTIFICATION_CREATED: 'notification:created',
  /** S→C `user:{id}`: `{ ids }` hoặc `{ all: { filter, workspaceId?, before } }` — mục hộp thư đã đọc (p1-07 be.md §15.5). */
  NOTIFICATION_READ: 'notification:read',
  READ_UPDATED: 'read:updated',
  /** S→C `user:{id}`: `{ reason: 'MUTE' | 'READ_ALL' | 'REBUILD' }` — số chưa đọc đổi mà client không tự suy được (p1-07). */
  UNREAD_SUMMARY_CHANGED: 'unread:summary-changed',
  PRESENCE_UPDATED: 'presence:updated',

  // ── Communication Hub (Phase 1) ─────────────────────────────────────────
  MESSAGE_CREATED: 'message:created',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',
  /** S→C `user:{id}`: `{ messageId, scopeType, scopeId, hidden, originDeviceId? }` — ẩn/hiện phía tôi đa thiết bị (p1-04 be.md §6). */
  MESSAGE_HIDDEN: 'message:hidden',
  /** S→C `ch:{id}`: `{ threadId, parentMessageId, replyCount, lastReplyAt, lastReplierIds, lastReplySeq }` (p1-06 be.md §6). */
  THREAD_UPDATED: 'thread:updated',
  /** S→C `user:{id}`: `{ threadId, state }` — theo dõi thread đồng bộ đa thiết bị (p1-06 be.md §6). */
  THREAD_SUBSCRIPTION_UPDATED: 'thread:subscription-updated',
  REACTION_UPDATED: 'reaction:updated',
  PIN_UPDATED: 'pin:updated',
  /** S→C `user:{id}`: `{ v:1, serverNow, messageId, saved }` — chỉ khi trạng thái đổi; đồng bộ "đã lưu" đa thiết bị (p1-09 be.md §6). */
  SAVED_UPDATED: 'saved:updated',
  /** S→C `user:{blockerId}` (mọi thiết bị của NGƯỜI CHẶN, KHÔNG gửi cho người bị chặn): `{ v:1, serverNow, added?: userId }` hoặc `{ removed?: userId }` (p1-08 be.md §6). */
  BLOCK_UPDATED: 'block:updated',
  /** S→C (p5-04 be.md §6). `announcement:updated` → `ch:{id}`: `{ v, serverNow, messageId, channelId, required, deadlineAt, cancelled }` · `user:{id}` (đa thiết bị): `{ …, required:true, confirmedByMe:true }`. `announcement:confirmed` → `user:{người yêu cầu}`: `{ …, confirmedCount }` — có người vừa bấm "Đã đọc". */
  ANNOUNCEMENT_UPDATED: 'announcement:updated',
  ANNOUNCEMENT_CONFIRMED: 'announcement:confirmed',
  /** S→C `user:{id}` từng thành viên hội thoại (p1-04 be.md §6, adapter CONVERSATION — p1-05). */
  CONVERSATION_ACTIVITY: 'conversation:activity',
  /** S→C `user:{id}` từng member (p1-05 be.md §6) — hội thoại mới tạo/thêm người mới. */
  CONVERSATION_CREATED: 'conversation:created',
  /** S→C `user:{id}` members + `conv:{id}` (p1-05 be.md §6) — patch/dissolve/archive/block/eligibility đổi. */
  CONVERSATION_UPDATED: 'conversation:updated',
  /** S→C `conv:{id}` (đổi vai trò/thêm/xoá/chuyển chủ) · `user:{id}` (cài đặt cá nhân) — p1-05 be.md §6. */
  CONVERSATION_MEMBER_UPDATED: 'conversation:member-updated',
  /** S→C `user:{id}` người bị xoá/rời — p1-05 be.md §6. */
  CONVERSATION_REMOVED: 'conversation:removed',
  /** S→C `conv:{id}` — read marker (p1-05 be.md §6/§5.8, p1-07 ghi). */
  READ_RECEIPT: 'read:receipt',
  CHANNEL_CREATED: 'channel:created',
  CHANNEL_UPDATED: 'channel:updated',
  CHANNEL_ARCHIVED: 'channel:archived',
  CHANNEL_GRANTED: 'channel:granted',
  CHANNEL_REVOKED: 'channel:revoked',
  /** `{ v, channelId, workspaceId, seq, threadId, authorId, lastMessageAt }` — sau khi commit một tin (be.md p1-03 §6). */
  CHANNEL_ACTIVITY: 'channel:activity',
  MEMBER_UPDATED: 'member:updated',
  WORKSPACE_UPDATED: 'workspace:updated',
  WORKSPACE_ARCHIVED: 'workspace:archived',
  TYPING: 'typing',

  // ── Project Management (Phase 2+) ───────────────────────────────────────
  BOARD_UPDATED: 'board:updated',
  /** p4-04 (be.md §6) S→C `board:{id}`: `{ batchId, boardId, count, final, taskIds }` — một lô dời lịch đã ghi xong. */
  BOARD_RESCHEDULED: 'board:rescheduled',
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_MOVED: 'task:moved',
  TASK_DELETED: 'task:deleted',
  TASK_ACTIVITY: 'task:activity',
  TASK_REVIEW_UPDATED: 'task:review-updated', // p4-05 (be.md §6): tiến độ lượt chấm đổi — chỉ SỐ ĐẾM, KHÔNG điểm/nhận xét
  REVIEW_REQUESTED: 'review:requested',

  // ── Resource Hub (Phase 3, p3-01 P1) ─────────────────────────────────────
  /** S→C `ws:{id}`: `{ v, workspaceId, folderId, kind: 'FOLDER'|'RESOURCE', action, subjectId? }` — KHÔNG tên tệp; client chỉ invalidate danh sách đang mở. */
  RESOURCE_CHANGED: 'resource:changed',

  // ── Study Hub / live quiz (Phase 2–3) ────────────────────────────────────
  QUIZ_LOBBY: 'quiz:lobby',
  QUIZ_QUESTION: 'quiz:question',
  QUIZ_REVEAL: 'quiz:reveal',
  QUIZ_LEADERBOARD: 'quiz:leaderboard',
  /** CHỈ host (`user:{hostId}`): số người đã trả lời câu đang mở, throttle 500 ms (p5-01 be.md). */
  QUIZ_PROGRESS: 'quiz:progress',
  QUIZ_ENDED: 'quiz:ended',

  // ── Cuộc gọi RING (Phase 2, p2-01 be.md §6) — payload luôn có `v:1`, `callId`, `version`, `serverNow` ──
  /** S→C `user:{callee}`: `{ call: IncomingCallView, ring, expiresAt }` — `ring:false` = nhóm > 16 người, chỉ hiện banner "Tham gia". */
  CALL_INCOMING: 'call:incoming',
  /** S→C `user:{initiator}` + `call:{id}`: `{ userId, originDeviceId }` — có người trả lời. */
  CALL_ACCEPTED: 'call:accepted',
  /** S→C `user:{answerer}` (mọi thiết bị): `{ originDeviceId }` — bỏ qua khi `originDeviceId` là máy này. */
  CALL_ANSWERED_ELSEWHERE: 'call:answered-elsewhere',
  /** S→C `user:{initiator}` + `call:{id}` + `user:{decliner}`: `{ userId, originDeviceId }`. */
  CALL_DECLINED: 'call:declined',
  /** S→C `user:{người đang RINGING}`: `{ reason: 'CANCELLED' | 'NO_ANSWER' }`. */
  CALL_CANCELLED: 'call:cancelled',
  /** S→C `user:{mọi participant}` + `call:{id}`: `{ endReason, durationSec }`. */
  CALL_ENDED: 'call:ended',
  /** S→C `call:{id}` + `user:{initiator}`: `{ participant: { userId, state, role, handRaisedAt, mutedByHost } }`. */
  CALL_PARTICIPANT_UPDATED: 'call:participant-updated',

  // ── Lịch họp (Phase 2, p2-04 be.md §6) — payload luôn có `v:1`, `meetingId`, `version` ──────────────
  /** S→C `user:{attendee}`: `{ meetingId, workspaceId, title, startAt, endAt, hostId, role }`. */
  MEETING_INVITED: 'meeting:invited',
  /** S→C `user:{attendee}` + `meet:{id}`: `{ meetingId, version, changedFields[], status, startAt?, endAt?, rsvpSummary? }`. */
  MEETING_UPDATED: 'meeting:updated',
  /** S→C `user:{attendee}` + `meet:{id}`: `{ meetingId, version, cancelReason?, byAdmin }`. */
  MEETING_CANCELLED: 'meeting:cancelled',
  /** S→C `user:{removedUserId}` + `meet:{id}`: `{ meetingId, userId, version }`. */
  MEETING_ATTENDEE_REMOVED: 'meeting:attendee-removed',

  // ── Thoại/video, Pomodoro, tích hợp, tài liệu (Phase 4+) ─────────────────
  CALL_UPDATED: 'call:updated',
  CALL_RECORDING: 'call:recording',
  POMODORO_UPDATED: 'pomodoro:updated',
  INTEGRATION_UPDATED: 'integration:updated',
  DOCUMENT_UPDATED: 'document:updated',

  // ── O2O, gamification, dịch vụ in (Phase 5+) ─────────────────────────────
  PARTNER_ORDER: 'partner:order',
  GAMIFICATION_UPDATED: 'gamification:updated',
  SKILL_UNLOCKED: 'skill:unlocked', // p6-06 S→C `user:{id}`: `{ v, skillId, code, name, icon, unlockedAt }` — huy hiệu kỹ năng mới
  /** p6-07 S→C `user:{id}`: `{ v, portfolioId, buildId, buildVersion, status: BUILDING|READY|FAILED, url?, error?, serverNow }` — tiến độ dựng trang portfolio (url chỉ khi READY). */
  PORTFOLIO_BUILD_UPDATED: 'portfolio:build-updated',
  PRINT_ORDER_UPDATED: 'print-order:updated',
  /** S→C `user:{id}` từng MEMBER+: `{ v, workspaceId, walletVersion, changedUserIds, reason, serverNow }` — KHÔNG kèm số tiền (p6-04). */
  WALLET_UPDATED: 'wallet:updated',
  /** p6-08 S→C `user:{studentId}` + nhân sự công ty: `{ v, offerId, companyId, status, threadLocked, serverNow }` — lời mời đổi trạng thái/khoá thread (KHÔNG tiêu đề/nội dung). */
  OFFER_UPDATED: 'offer:updated',
  /** p6-08 S→C cùng đích `offer:updated`: `{ v, offerId, messageId, side, createdAt, serverNow }` — tin mới trong lời mời (KHÔNG nội dung, gọi REST lấy lại). */
  OFFER_MESSAGE_CREATED: 'offer:message-created',
  /** p6-08 S→C `user:{memberId}` (chỉ nhân sự công ty, sinh viên thường không nhận): `{ v, companyId, status, tier, serverNow }` — doanh nghiệp được duyệt/tạm ngưng/đổi gói. */
  COMPANY_UPDATED: 'company:updated',
  /** p7-05 S→C `user:{requestedBy}`: `{ v, scanId, workspaceId, status, progress, failureCode?, serverNow }` — tiến độ/trạng thái lượt quét trùng lặp nội bộ. */
  PLAGIARISM_SCAN_UPDATED: 'plagiarism:scan-updated',

  // ── Client → server ──────────────────────────────────────────────────────
  /** C→S, ack `{ok,code?}`: `{ scopeType, scopeId, threadId? }` — bắt đầu gõ. */
  TYPING_START: 'typing:start',
  /** C→S, ack `{ok,code?}`: `{ scopeType, scopeId, threadId? }` — dừng gõ. */
  TYPING_STOP: 'typing:stop',
  /** C→S, ack `{ok,code?}`: `{ active }`. */
  PRESENCE_HEARTBEAT: 'presence:heartbeat',
  QUIZ_ANSWER: 'quiz:answer',
  /** Payload theo SDK LiveKit (Phase 4) — chưa có kiểu cụ thể ở Phase 0. */
  CALL_SIGNAL: 'call:signal',
} as const;

export type SocketEventName = (typeof SocketEvent)[keyof typeof SocketEvent];

/**
 * Payload `permission:revoked` (S→C, tới `user:{id}`) — khớp BE
 * `revokeScope()` (`be/src/core/permission/revoke-scope.ts`).
 *
 * ⚠️ `reason` khai ĐỦ 8 giá trị BE thật sự gửi (`RevokeInput['reason']`),
 * KHÔNG phải 7 giá trị liệt kê trong `docs/plans/.../p0-02-access-control/
 * README.md` §5 — README thiếu `ANONYMIZED`, code BE mới là nguồn đúng.
 *
 * `scopeType` khai ĐỘC LẬP với `ScopeType` của `core/permission/scope.ts`
 * (cùng 5 giá trị) cố ý: `core/socket` không cần biết `core/permission` tồn
 * tại, giữ đúng vai "chỉ khai hợp đồng sự kiện" của file này.
 */
export interface PermissionRevokedPayload {
  v: 1;
  scopeType: 'CALL' | 'CHANNEL' | 'CONVERSATION' | 'MEETING' | 'WORKSPACE';
  scopeId: string;
  /** Version MỚI của scope sau khi bump — dùng để bỏ qua sự kiện cũ tới trễ nếu cần so sánh. */
  version: number;
  reason:
    | 'ANONYMIZED'
    | 'ARCHIVED'
    | 'BANNED'
    | 'DISSOLVED'
    | 'EXPIRED' // 'EXPIRED': p3-04, BE `revoke-scope.ts` chưa có — xem `guest-revoke.utils.ts`
    | 'GRANT_REVOKED'
    | 'LEFT'
    | 'REMOVED'
    | 'ROLE_CHANGED';
  /** `true` ⇒ scope con (vd mọi CONVERSATION GROUP của 1 WORKSPACE) cũng vừa mất hiệu lực. */
  cascade: boolean;
}

/**
 * Mã lỗi handshake (`connect_error.data.code`) xác nhận PHIÊN CHẾT THẬT —
 * khác lỗi mạng (mất sóng, server bận). Khớp `AUTH_003/004/011/012` phía BE
 * (`docs/plan/config-be.md` §7): token sai chữ ký/hết hạn, tài khoản bị khoá,
 * tài khoản đang chờ xoá. Dùng ở `socket.auth-sync.ts` (dọn phiên) và
 * `use-connection-state.ts` (trạng thái `unauthorized`, banner im lặng vì
 * guard đăng xuất tự lo — xem `app.md` §3 bảng hành vi `ConnectionBanner`).
 */
export const SOCKET_AUTH_LOGOUT_CODES = new Set(['AUTH_003', 'AUTH_004', 'AUTH_011', 'AUTH_012']);
