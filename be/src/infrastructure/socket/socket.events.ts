/**
 * Enum các event Socket.IO chuẩn của hệ thống.
 * Dùng chung giữa server và client để tránh typo.
 *
 * Base Phase 0 chỉ dùng USER_CONNECTED/JOIN_ROOM/LEAVE_ROOM/PERMISSION_REVOKED
 * thật sự — phần còn lại là hợp đồng tên sự kiện cho các phân hệ Phase 1+
 * (Communication Hub, Project Management, Study/Quiz, ...) để admin/app code
 * song song theo đúng tên, không phát minh lại khi module tương ứng được xây.
 */
export enum SocketEvent {
  // ── Kết nối / phòng (Phase 0 — có mã thật) ──────────────────────────────
  /** User vừa kết nối */
  USER_CONNECTED = "user:connected",
  /** User vừa ngắt kết nối */
  USER_DISCONNECTED = "user:disconnected",
  /** Yêu cầu tham gia phòng — payload { kind, id }, ack { ok } */
  JOIN_ROOM = "room:join",
  /** Yêu cầu rời phòng — payload { kind, id } */
  LEAVE_ROOM = "room:leave",
  /** Quyền/room bị thu hồi — server chủ động đẩy tới `user:{id}` rồi kick khỏi room */
  PERMISSION_REVOKED = "permission:revoked",
  /** S→C (mọi kết nối, p0-07): `{ v, keys, configVersion, serverNow }` — cờ/giới hạn runtime vừa đổi, client tự `GET /capabilities` lại */
  CONFIG_UPDATED = "config:updated",

  /** @deprecated dùng MESSAGE_CREATED khi module communication có mã */
  NEW_MESSAGE = "message:new",
  /** Thông báo hệ thống (generic) */
  NOTIFICATION = "notification",
  /** Lỗi phía server */
  ERROR = "error",

  // ── Notification / presence (Phase 1) ───────────────────────────────────
  NOTIFICATION_CREATED = "notification:created",
  /** S→C: `{ v, ids?, all?: { filter, workspaceId?, before }, serverNow }` — đồng bộ đã đọc đa thiết bị (be.md p0-06 §6.1) */
  NOTIFICATION_READ = "notification:read",
  /** S→C `user:{id}` (p1-07 be.md §6): `{ streamType, streamId, lastReadSeq, unreadCount?, mentionCount?, originDeviceId? }` — đồng bộ đã đọc đa thiết bị. */
  READ_UPDATED = "read:updated",
  /** S→C `user:{id}` (p1-07 be.md §6): `{ reason: "MUTE"|"READ_ALL"|"REBUILD" }` — gợi ý client refetch `GET /me/unread/summary` (debounce 2 s/user). */
  UNREAD_SUMMARY_CHANGED = "unread:summary-changed",
  PRESENCE_UPDATED = "presence:updated",

  // ── Realtime core (p0-03 — có mã thật) ──────────────────────────────────
  /** C→S: `{ token }` → ack `{ ok, code? }` — làm mới `socket.data.user/exp` không cần reconnect */
  AUTH_REFRESH = "auth:refresh",
  /** S→C: `{ v, exp }` — gửi 60s trước khi access token hết hạn nếu client chưa `auth:refresh` */
  SESSION_EXPIRING = "session:expiring",
  /** C→S: `{ scopeType, scopeId, threadId? }` — bắt đầu gõ */
  TYPING_STOP = "typing:stop",
  /** C→S: `{ dnd, until? }` — bật/tắt DND thủ công */
  PRESENCE_SET = "presence:set",

  // ── Communication Hub (Phase 1) ──────────────────────────────────────────
  MESSAGE_CREATED = "message:created",
  MESSAGE_UPDATED = "message:updated",
  MESSAGE_DELETED = "message:deleted",
  /** S→C `user:{id}`: `{ messageId, scopeType, scopeId, hidden }` — ẩn/hiện phía tôi đa thiết bị (p1-04 be.md §6). */
  MESSAGE_HIDDEN = "message:hidden",
  THREAD_UPDATED = "thread:updated",
  /** S→C `user:{id}` (p1-06 be.md §6) — đồng bộ theo dõi thread đa thiết bị sau `PUT /threads/:id/subscription`. */
  THREAD_SUBSCRIPTION_UPDATED = "thread:subscription-updated",
  REACTION_UPDATED = "reaction:updated",
  PIN_UPDATED = "pin:updated",
  /** S→C `user:{id}` (p1-09 be.md §6): `{ v, messageId, saved, serverNow }` — đồng bộ lưu/bỏ lưu tin đa thiết bị (chỉ phát khi trạng thái ĐỔI). */
  SAVED_UPDATED = "saved:updated",
  /**
   * S→C (p5-04 be.md §6) — yêu cầu xác nhận đã đọc thông báo kênh thay đổi:
   *  · `ch:{channelId}`: `{ v, messageId, channelId, required, deadlineAt, cancelled, serverNow }` khi tạo/huỷ/đổi hạn;
   *  · `user:{userId}` (người vừa xác nhận, đa thiết bị): `{ v, messageId, channelId, required: true, confirmedByMe: true, serverNow }`.
   * Không dùng `message:updated` vì app xử lý sự kiện đó như bản chụp đầy đủ của tin (so `version`), payload cục bộ sẽ ghi đè sai.
   */
  ANNOUNCEMENT_UPDATED = "announcement:updated",
  /** S→C `user:{requestedBy}` (p5-04 be.md §6): `{ v, messageId, channelId, confirmedCount, serverNow }` — có người mới xác nhận (throttle 2 s/yêu cầu). */
  ANNOUNCEMENT_CONFIRMED = "announcement:confirmed",
  /** S→C `user:{id}` từng thành viên hội thoại (p1-04 be.md §6, adapter CONVERSATION — p1-05). */
  CONVERSATION_ACTIVITY = "conversation:activity",
  /** S→C `user:{id}` từng member (p1-05 be.md §6) — hội thoại mới tạo/thêm người mới. */
  CONVERSATION_CREATED = "conversation:created",
  /** S→C `user:{id}` members + `conv:{id}` (p1-05 be.md §6) — patch/dissolve/archive/block/eligibility đổi. */
  CONVERSATION_UPDATED = "conversation:updated",
  /** S→C `conv:{id}` (đổi vai trò/thêm/xoá/chuyển chủ) · `user:{id}` (cài đặt cá nhân) — p1-05 be.md §6. */
  CONVERSATION_MEMBER_UPDATED = "conversation:member-updated",
  /** S→C `user:{id}` người bị xoá/rời — p1-05 be.md §6. */
  CONVERSATION_REMOVED = "conversation:removed",
  /** S→C `conv:{id}` — read marker (p1-05 be.md §6/§5.8, p1-07 ghi). */
  READ_RECEIPT = "read:receipt",
  /**
   * S→C kênh public → room `ws:{workspaceId}`, kênh private → `user:{id}` từng người đọc được (p1-03 be.md §6, p1-04 §6,
   * adapter CHANNEL): `{ v, channelId, workspaceId, seq, threadId, authorId, lastSeq, lastMessageAt, mentionMe }` — KHÔNG
   * có nội dung/preview/tên người gửi. `authorId`/`seq` là phần app bắt buộc phải có để không cộng chưa đọc cho tin của
   * CHÍNH MÌNH và để chống cộng trùng (xem docstring `emitActivity` ở `channel-message-scope.adapter.ts`).
   */
  CHANNEL_ACTIVITY = "channel:activity",
  CHANNEL_CREATED = "channel:created",
  CHANNEL_UPDATED = "channel:updated",
  CHANNEL_ARCHIVED = "channel:archived",
  CHANNEL_GRANTED = "channel:granted",
  CHANNEL_REVOKED = "channel:revoked",
  MEMBER_UPDATED = "member:updated",
  /** S→C `admin:moderation` (p1-08 be.md §6): `{ v, groupKey, targetType, reportCount }` — có báo cáo mới (không kèm nội dung). */
  MODERATION_REPORT_CREATED = "moderation:report-created",
  /** S→C `admin:moderation` (p1-08 be.md §6): `{ v, groupKey, status, resolution }` — nhóm báo cáo được xử lý. */
  MODERATION_REPORT_UPDATED = "moderation:report-updated",
  /** S→C `user:{blockerId}` (p1-08 be.md §6): `{ v, added?: userId, removed?: userId }` — đồng bộ danh sách chặn đa thiết bị (KHÔNG gửi cho người bị chặn). */
  BLOCK_UPDATED = "block:updated",
  WORKSPACE_UPDATED = "workspace:updated",
  WORKSPACE_ARCHIVED = "workspace:archived",
  /**
   * S→C `ws:{workspaceId}` (p6-04 be.md §6): `{ v, workspaceId, walletVersion, changedUserIds, reason, serverNow }`
   * — KHÔNG kèm số tiền; client thấy `walletVersion` mới hơn cache thì refetch `summary`.
   */
  WALLET_UPDATED = "wallet:updated",
  TYPING = "typing",

  // ── Project Management (Phase 2) ─────────────────────────────────────────
  BOARD_UPDATED = "board:updated",
  TASK_CREATED = "task:created",
  TASK_UPDATED = "task:updated",
  TASK_MOVED = "task:moved",
  TASK_DELETED = "task:deleted",
  TASK_ACTIVITY = "task:activity",
  /**
   * S→C `board:{boardId}` (p4-04 be.md §6): `{ v, boardId, rescheduleId?, batchId?, taskIds, count, final, serverNow }` — dời lịch
   * > `rescheduleEmitEachMax` thẻ (thay cho `task:updated` từng thẻ) hoặc mỗi lượt của lô nền; `final = true` ở lượt cuối.
   */
  BOARD_RESCHEDULED = "board:rescheduled",
  /**
   * S→C `board:{boardId}` (p4-05 be.md §6): `{ v, serverNow, taskId, boardId, roundId, round, status, approvedCount, requiredReviews,
   * assignedCount, reviewerIds }` — mở/đóng/huỷ lượt chấm, nộp chấm, giao lại, miễn. KHÔNG mang điểm/nhận xét (client tải lại
   * `GET /tasks/:id/reviews` — kết quả lọc theo người xem).
   */
  TASK_REVIEW_UPDATED = "task:review-updated",
  REVIEW_REQUESTED = "review:requested",

  // ── Resource Hub (Phase 3, p3-01 P1) ─────────────────────────────────────
  /** S→C `ws:{workspaceId}`: `{ v:1, workspaceId, folderId, kind: "FOLDER"|"RESOURCE", action: "CREATED"|"UPDATED"|"DELETED" }` — KHÔNG tên tệp; client invalidate danh sách thư mục đang mở (p3-01 be.md §6). */
  RESOURCE_CHANGED = "resource:changed",

  // ── Study / Live Quiz (Phase 3–4) ────────────────────────────────────────
  QUIZ_LOBBY = "quiz:lobby",
  QUIZ_QUESTION = "quiz:question",
  QUIZ_REVEAL = "quiz:reveal",
  QUIZ_LEADERBOARD = "quiz:leaderboard",
  QUIZ_ENDED = "quiz:ended",
  /**
   * S→C `user:{hostId}` (p5-01 be.md §6, chỉ host, throttle 500 ms): `{ v, serverNow, sessionId, index, answeredCount, playersCount }` —
   * số người đã trả lời câu đang mở (người chơi KHÔNG nhận; không lộ ai trả lời gì).
   */
  QUIZ_PROGRESS = "quiz:progress",
  /** S→C `quiz:{id}` (p5-01 P1, CHƯA phát): `{ v:1, hostId }` — chuyển quyền host. */
  QUIZ_HOST_CHANGED = "quiz:host-changed",

  // ── Calls (Phase 2, p2-01 be.md §6) — mọi payload có `v:1`, `callId`, `version`, `serverNow` ─────────
  /** S→C `user:{calleeId}`: `{ call, ring: boolean, expiresAt }` — có cuộc gọi đến (`ring:false` = banner "Tham gia" cho nhóm > 16 người). */
  CALL_INCOMING = "call:incoming",
  /** S→C `user:{initiator}` + `call:{id}`: `{ userId, originDeviceId }` — có người trả lời. */
  CALL_ACCEPTED = "call:accepted",
  /** S→C `user:{answerer}` (mọi thiết bị): `{ originDeviceId }` — thiết bị khác của cùng người đã trả lời, ngừng chuông. */
  CALL_ANSWERED_ELSEWHERE = "call:answered-elsewhere",
  /** S→C `user:{initiator}` + `call:{id}` + `user:{decliner}`: `{ userId, originDeviceId }`. */
  CALL_DECLINED = "call:declined",
  /** S→C `user:{mỗi người đang RINGING}`: `{ reason: CANCELLED|NO_ANSWER|DECLINED_ELSEWHERE }`. */
  CALL_CANCELLED = "call:cancelled",
  /** S→C `user:{mọi participant}` + `call:{id}`: `{ endReason, durationSec }`. */
  CALL_ENDED = "call:ended",
  /**
   * S→C `call:{id}` + `user:{initiator}` (khi RINGING): `{ participant: { userId, state, role, handRaisedAt, mutedByHost } }`;
   * phòng thoại kênh (p2-03): `participant` thêm `name/avatarUrl/isHost` + `count`, và bản CÔNG KHAI tới `ch:{channelId}`.
   */
  CALL_PARTICIPANT_UPDATED = "call:participant-updated",
  /**
   * S→C `call:{id}` + `user:{target}` (p2-03): `{ type, targetUserId, byUserId, reason? }` — host điều khiển phòng.
   * p2-05 (phòng họp) thêm `type`: `MUTED` (kèm `source`), `ROLE_CHANGED` (kèm `role`), `SCREEN_SHARE_REJECTED`, `LOWER_ALL_HANDS`
   * (`targetUserId = null`, room `call:{id}`), `HAND_LOWERED` (hạ tay MỘT người — chỉ `user:{target}`), `REMOVED` — gửi thẳng từ request của
   * host (không qua outbox `call.signal-dispatch`).
   */
  CALL_HOST_ACTION = "call:host-action",
  /**
   * S→C (p2-03 README §2/§5): `{ channelId, workspaceId, voice: { callId: string | null, count } }` — số người đang trong phòng thoại của kênh
   * VOICE. Kênh công khai → room `ws:{workspaceId}`; kênh riêng tư → `user:{id}` từng người đọc được. ⚠ KHÔNG dùng tên `channel:activity`:
   * client coi `channel:activity` là "có tin mới trong kênh" và cộng chưa đọc theo `authorId`/`seq` của payload đó
   * (`useReadStateSync`) — số người trong phòng thoại không có hai field ấy.
   */
  CHANNEL_VOICE_ACTIVITY = "channel:voice-activity",

  // ── Meetings (Phase 2, p2-04 be.md §6) — mọi payload có `v:1`, `meetingId`, `version` ─────────
  /** S→C `user:{attendeeId}`: `{ meetingId, workspaceId, title, startAt, endAt, hostId, role }`. */
  MEETING_INVITED = "meeting:invited",
  /** S→C `user:{attendeeId}` + `meet:{id}`: `{ meetingId, version, changedFields[], status, startAt?, endAt?, rsvpSummary? }`. */
  MEETING_UPDATED = "meeting:updated",
  /** S→C `user:{attendeeId}` + `meet:{id}`: `{ meetingId, version, cancelReason?, byAdmin }`. */
  MEETING_CANCELLED = "meeting:cancelled",
  /** S→C `user:{removedUserId}` + `meet:{id}`: `{ meetingId, userId, version }`. */
  MEETING_ATTENDEE_REMOVED = "meeting:attendee-removed",
  // ── Phòng họp (Phase 2, p2-05 be.md §6) — payload có `v:1`, `meetingId`, `serverNow` ─────────
  /** S→C `meet:{id}` + `user:{attendeeIds}`: `{ meetingId, callId, startedBy, version, restarted }` — chủ trì đã bắt đầu, người đang chờ gọi lại `join`. */
  MEETING_STARTED = "meeting:started",
  /** S→C `meet:{id}` + `call:{callId}`: `{ meetingId, callId, reason, durationSec? }` — cuộc họp đã kết thúc cho mọi người. */
  MEETING_ENDED = "meeting:ended",
  /** S→C: REQUESTED/CANCELLED → `user:{HOST, CO_HOST}`; ADMITTED/DENIED → `user:{requester}`. `{ meetingId, state, userId, displayName?, lobbyCount }`. */
  MEETING_LOBBY = "meeting:lobby",
  // ── Biên bản & ghi hình (Phase 2, p2-06 be.md §6) — payload có `v:1`, `meetingId`, `serverNow` ─────────
  /** S→C `meet:{id}` + `user:{HOST, CO_HOST}`: `{ meetingId, recordingId, status, durationSec?, retentionExpiresAt? }` — mọi đổi trạng thái bản ghi (READY/FAILED/xoá…). */
  MEETING_RECORDING_UPDATED = "meeting:recording-updated",
  /** S→C `meet:{id}` + `user:{attendeeIds}`: `{ meetingId, recapId, publishedVersion, firstPublish }` — biên bản vừa được công bố (hoặc công bố lại). */
  MEETING_RECAP_PUBLISHED = "meeting:recap-published",
  /**
   * S→C `admin:media` (p2-07 be.md §6): `{ v: 1, kind: "MEETING" | "CALL" | "RECORDING", id, status, serverNow }` — chỉ để bảng admin invalidate, KHÔNG có nội dung/người dùng.
   * Throttle 1 sự kiện/giây/`kind` (Redis `SET NX PX`). Join bằng `room:join { kind: "admin", id: "media" }` (guard `meeting:view`).
   */
  ADMIN_MEDIA_UPDATED = "admin:media-updated",
  /**
   * S→C `admin:ops` (p0-03 admin.md): `{ v: 1, socketConnections, onlineUsers, serverNow }` — số liệu vận hành cho ô KPI "Kết nối realtime"/"Người dùng trực tuyến" của dashboard admin
   * (cùng dạng `realtime` của `GET /admin/overview`; admin `setQueryData`, không refetch). Chỉ SỐ, không danh tính. Cron TĨNH `ops.stats-broadcast` (30 s) phát và CHỈ khi có admin đang ở
   * room (`socket.ops-watch.ts`). Join bằng `room:join { kind: "admin", id: "ops" }` (guard `dashboard:view`).
   */
  OPS_STATS = "ops:stats",

  // ── Voice/Call, Collab, Gamification, O2O, AI (Phase 4–6, AI ⏸) ─────────
  CALL_UPDATED = "call:updated",
  /**
   * S→C `call:{callId}` (p2-06 be.md §6): `{ v, callId, meetingId, state: CONSENT_REQUESTED | CONSENT_PROGRESS | RECORDING | STOPPING | STOPPED | FAILED,
   * requestId?, expiresAt?, acceptedCount?, pendingCount?, declinedCount?, recordingId?, startedAt?, requestedBy?, serverNow }` — chỉ SỐ LƯỢNG đồng ý,
   * không tên người từ chối.
   */
  CALL_RECORDING = "call:recording",
  POMODORO_UPDATED = "pomodoro:updated",
  INTEGRATION_UPDATED = "integration:updated",
  DOCUMENT_UPDATED = "document:updated",
  /**
   * S→C `user:{id}` từng người trong khán giả của bảng (p6-02 be.md §6): `{ v: 1, id, workspaceId, name, visibility, status, thumbnailAssetId, version }` — CHỈ metadata
   * (tạo, đổi tên, đổi visibility, đổi ảnh thu nhỏ, lưu trữ/khôi phục); nội dung vẽ đi qua collab, không qua Socket.IO. Khán giả tính theo trạng thái HIỆN TẠI (như `document:updated`):
   * WORKSPACE → mọi thành viên MEMBER+ + người tạo + cộng tác viên; PRIVATE → chỉ người tạo + cộng tác viên.
   */
  WHITEBOARD_UPDATED = "whiteboard:updated",
  PARTNER_ORDER = "partner:order",
  GAMIFICATION_UPDATED = "gamification:updated",
  /** S→C `user:{id}` (p6-06 be.md §6): `{ v: 1, skillId, code, name, icon, unlockedAt }` — huy hiệu kỹ năng mới (app hiện chúc mừng một lần). */
  SKILL_UNLOCKED = "skill:unlocked",
  PRINT_ORDER_UPDATED = "print-order:updated",
  /**
   * S→C `user:{userId}` (p6-07 be.md §6): `{ v: 1, portfolioId, buildId, buildVersion, status: "BUILDING" | "READY" | "FAILED", url?, error?, serverNow }` —
   * tiến độ dựng trang portfolio (url chỉ khi READY; error là câu tiếng Việt rút gọn, không stack). Client patch `latestBuild` của `['career','portfolio']`.
   */
  PORTFOLIO_BUILD_UPDATED = "portfolio:build-updated",
  /**
   * S→C `user:{studentId}` + `user:{memberId}` (mọi nhân sự ACTIVE của công ty) (p6-08 be.md §6): `{ v: 1, offerId, companyId, status, threadLocked, serverNow }` — lời mời đổi trạng thái
   * (gửi, đọc, quan tâm, từ chối, thu hồi, hết hạn, khoá thread). KHÔNG có tiêu đề/nội dung — client gọi REST lấy chi tiết.
   */
  OFFER_UPDATED = "offer:updated",
  /** S→C cùng đích `offer:updated` (p6-08): `{ v: 1, offerId, messageId, side, createdAt, serverNow }` — tin mới trong lời mời (KHÔNG nội dung — client gọi `GET /offers/:id/messages`). */
  OFFER_MESSAGE_CREATED = "offer:message-created",
  /** S→C `user:{memberId}` (p6-08): `{ v: 1, companyId, status, tier, serverNow }` — công ty được duyệt/từ chối/tạm ngưng/khôi phục hoặc đổi gói. */
  COMPANY_UPDATED = "company:updated",
  /**
   * S→C `ch:{id}` / `conv:{id}` (p7-04 be.md §6): `{ v: 1, pollId, messageId, scopeType, scopeId, status, closeReason?, options: [{ id, voteCount }], voterCount, version, serverNow }` —
   * kết quả khảo sát đổi (bầu/đổi/bỏ phiếu — throttle ≤ 1 lần/giây/khảo sát; đóng khảo sát). KHÔNG có `userId`/`myOptionIds` (khảo sát ẩn danh không lộ ai bầu gì; client tự giữ lựa chọn của mình
   * và dựng `percent` từ số đếm). Client bỏ sự kiện có `version` ≤ bản đang có.
   */
  POLL_UPDATED = "poll:updated",
  /**
   * S→C `user:{authorId}` (p7-04 be.md §6, đa thiết bị): `{ v: 1, id, status, sendAt, messageId?, failReason?, version, serverNow }` — tin hẹn giờ vừa tạo/sửa/huỷ/phát/lỗi.
   * KHÔNG mang nội dung tin (client gọi lại `GET /me/scheduled-messages`); tin đã phát tới người khác qua `message:created` như tin thường.
   */
  SCHEDULED_MESSAGE_UPDATED = "scheduled-message:updated",
  /**
   * S→C `user:{userId}` (p7-03 be.md §6, đa thiết bị): `{ v: 1, assessmentId, level: "MEDIUM" | "HIGH", suggestion: "BREAK" | "SPREAD_TASKS" | "SLEEP", serverNow }` — cảnh báo nhẹ sức khoẻ học tập
   * (tối đa 1/24 giờ, chỉ người đã BẬT theo dõi). KHÔNG có điểm số/phút/nhân tố (app gọi `GET /me/wellbeing` để lấy chi tiết); chỉ đi vào room riêng của chính người đó.
   */
  WELLBEING_ALERT = "wellbeing:alert",
  /**
   * S→C `user:{requestedBy}` (p7-05 be.md §6): `{ v: 1, scanId, workspaceId, status, progress, failureCode?, serverNow }`
   * — tiến độ/trạng thái lượt quét trùng lặp nội bộ vừa đổi (tạo, đổi trạng thái, tiến độ throttle 2 s, huỷ, xong).
   */
  PLAGIARISM_SCAN_UPDATED = "plagiarism:scan-updated",
  /** ⏸ D-13 — AI tạm dừng */
  AI_JOB_UPDATED = "ai-job:updated",

  // ── Client → server ──────────────────────────────────────────────────────
  TYPING_START = "typing:start",
  PRESENCE_HEARTBEAT = "presence:heartbeat",
  QUIZ_ANSWER = "quiz:answer",
  CALL_SIGNAL = "call:signal",
}
