/**
 * Kiểu DTO của `meeting-room` — khai TAY, khớp MÃ BE thật (`be/src/modules/meetings/entities/meeting-room.interface.ts`,
 * `services/meeting-room.*.ts`): p2-05 be.md §4/§6, chỗ nào mã khác tài liệu thì mã thắng (ghi chú tại chỗ).
 */

export type RoomRole = 'HOST' | 'CO_HOST' | 'MEMBER';
export type MeetingStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
export type JoinVia = 'DIRECT' | 'WAIT_FOR_HOST' | 'LOBBY';
/** Lý do phiên họp kết thúc (BE) cộng `MOVED_DEVICE` — lý do CỦA CLIENT: chính bạn vừa vào lại từ thiết bị khác nên máy này bị ngắt. */
export type MeetingEndReason =
  'HOST_ENDED' | 'EMPTY' | 'MAX_DURATION' | 'FORCE_ENDED' | 'WORKSPACE_ARCHIVED' | 'HOST_REMOVED' | 'MOVED_DEVICE';

export interface PublishPermissions {
  audio: boolean;
  screen: boolean;
  video: boolean;
}

/** `JoinResultDto` (BE) — `state` quyết định các trường còn lại; client KHÔNG suy trạng thái từ mã lỗi. */
export type JoinResult =
  | { joinOpensAt: string; meetingId: string; serverNow: string; startAt: string; state: 'WAITING_FOR_HOST' }
  | { meetingId: string; requestedAt: string; serverNow: string; state: 'IN_LOBBY' }
  | JoinedResult;

export interface JoinedResult {
  callId: string;
  closingAt: string | null;
  conversationId: string | null;
  livekitRoom: string;
  livekitUrl: string;
  lockedAt: string | null;
  meetingId: string;
  publishPermissions: PublishPermissions;
  /** p2-06: trạng thái ghi hình CHO NGƯỜI NÀY (`null` = không ghi, không có yêu cầu đồng ý) — chỉ báo + hộp thoại đồng ý dựa vào đây. */
  recording: RoomRecordingState | null;
  role: RoomRole;
  serverNow: string;
  state: 'JOINED';
  token: string;
  tokenExpiresAt: string;
}

/** Phần chi tiết cuộc họp phòng họp cần (`GET /meetings/:id` — `MeetingDetailDto` của p2-04, chỉ đọc tập con). */
export interface MeetingBrief {
  /** Mã họp `abc-defg-hij` — dùng dựng link mời người khác vào phòng. */
  code?: string;
  conversationId?: string;
  currentCallId?: string;
  endAt: string;
  endedAt?: string;
  endReason?: MeetingEndReason;
  /** Cuộc họp nền tảng ngoài (Zoom/Teams/Meet): link để "Mở liên kết cuộc họp" ở màn `MEET_010`. */
  externalUrl?: string;
  hostId: string;
  id: string;
  joinOpensAt: string;
  lobbyMode: 'OFF' | 'NON_ATTENDEES' | 'ALL';
  lockedAt?: string;
  myActions: {
    canEnd: boolean;
    /** p2-06: chủ trì/đồng chủ trì/tác giả biên bản — nút "Viết biên bản" ở màn kết thúc (kèm `recapRequired`). */
    canEditRecap?: boolean;
    canJoin: boolean;
    canRecord: boolean;
    canStart: boolean;
    joinVia: JoinVia | null;
  };
  myRole: 'HOST' | 'CO_HOST' | 'ATTENDEE' | null;
  platform: 'INTERNAL' | 'ZOOM' | 'TEAMS' | 'GOOGLE_MEET' | 'OTHER';
  /** Chỉ có ở CLIENT: `Date.now()` lúc nhận — đồng hồ theo giờ server = `serverNow + (bây giờ − receivedAt)`. */
  receivedAt: number;
  recapRequired: boolean;
  recordingAllowed: boolean;
  serverNow: string;
  startAt: string;
  startedAt?: string;
  status: MeetingStatus;
  title: string;
  version: number;
}

/** `start` trả kết quả `join` + chi tiết cuộc họp mới nhất (BE `createMeetingRoomController.start`). */
export type StartResult = JoinResult & { meeting?: MeetingBrief };

export interface RoomParticipantDto {
  handRaisedAt: string | null;
  joinedAt: string | null;
  mutedByHost: boolean;
  name: string;
  role: string;
  state: string;
  userId: string;
}

export interface RoomSnapshot {
  callId: string | null;
  closingAt: string | null;
  lobbyCount: number;
  lockedAt: string | null;
  meetingId: string;
  myRole: RoomRole | null;
  participants: RoomParticipantDto[];
  recording: RoomRecordingState | null;
  serverNow: string;
  status: MeetingStatus;
  version: number;
}

export interface LobbyEntry {
  displayName: string;
  requestedAt: string;
  userId: string;
}

/** Người được mời (tab "Được mời" + tên tác giả tin nhắn) — `GET /meetings/:id/attendees` (p2-04). */
export interface AttendeeLite {
  avatarUrl: string | null;
  name: string;
  role: 'HOST' | 'CO_HOST' | 'ATTENDEE';
  rsvp: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE';
  userId: string;
}

export type MuteSource = 'MICROPHONE' | 'CAMERA' | 'SCREEN_SHARE';

// ── payload socket (BE `meeting-room.signals.ts`, `call-signal.dispatcher.ts`) ──────────────────────────────────

export interface MeetingStartedPayload {
  callId: string;
  meetingId: string;
  restarted: boolean;
  startedBy: string;
  version: number;
}

export interface MeetingEndedPayload {
  callId: string | null;
  durationSec: number;
  meetingId: string;
  reason: string;
}

export type LobbyState = 'REQUESTED' | 'CANCELLED' | 'ADMITTED' | 'DENIED';

export interface MeetingLobbyPayload {
  displayName?: string;
  lobbyCount: number;
  meetingId: string;
  /** Với `CANCELLED` tới chủ trì: vì sao mục rời hàng chờ (ADMITTED/DENIED bởi người khác, hoặc chính người xin huỷ). */
  reason?: string;
  state: LobbyState;
  userId: string;
}

/** `meeting:updated` — khoá phòng/cảnh báo sắp đóng mang thêm `lockedAt`/`closingAt`; các thay đổi lịch chỉ có `changedFields`. */
export interface MeetingUpdatedPayload {
  changedFields?: string[];
  closingAt?: string | null;
  lockedAt?: string | null;
  meetingId: string;
  status?: MeetingStatus;
  version: number;
}

export type HostActionType =
  | 'MUTED'
  | 'REMOVED'
  | 'ROLE_CHANGED'
  | 'SCREEN_SHARE_REJECTED'
  | 'LOWER_ALL_HANDS'
  /** Chủ trì/đồng chủ trì hạ tay RIÊNG một người (`POST /meetings/:id/hands/:userId/lower`) — chỉ tới người đó (`user:{id}`). */
  | 'HAND_LOWERED';

export interface HostActionPayload {
  /** `true` khi tắt mic TẤT CẢ (`targetUserId = null`). */
  all?: boolean;
  byUserId: string | null;
  callId: string;
  role?: string;
  source?: string;
  targetUserId: string | null;
  /** Loại của p2-03 (`INVITE_SPEAK`, `HOST_CHANGED`…) cũng đi qua cùng sự kiện — bỏ qua ở phòng họp. */
  type: HostActionType | (string & {});
}

/** `call:participant-updated` (BE `call-signal.dispatcher.ts`) — payload lồng `participant`. */
export interface ParticipantUpdatedPayload {
  callId: string;
  participant: {
    handRaisedAt: string | null;
    mutedByHost: boolean;
    role: string;
    state: string;
    userId: string;
  };
  version: number;
}

/** Mã lý do màn "không vào được" — mã BE cộng hai mã CỦA CLIENT (`GONE` = 404/mất quyền, `DENIED` = chủ trì từ chối). */
export type BlockedCode =
  'DENIED' | 'GONE' | 'MEET_006' | 'MEET_007' | 'MEET_009' | 'MEET_010' | 'MEET_012' | 'MEET_013' | 'MEET_017' | 'MEET_018';

/** Tập con `message:created` (`features/chat`) đủ để đếm tin CHƯA ĐỌC trong nhóm chat của cuộc họp — không import kiểu của `chat`. */
export interface ChatMessageCreatedPayload {
  authorId: string | null;
  scopeId: string;
  scopeType: string;
}

// ── Ghi hình trong phòng (p2-06 — BE `entities/meeting-recap.interface.ts`, `services/recording-signals.ts`) ─────────────────────────

/** Trạng thái bản ghi đang CHẠY của phòng (`STARTING`→`RECORDING`→`STOPPING`) hoặc yêu cầu đồng ý còn hạn (`CONSENT_REQUESTED`). */
export type RoomRecordingStatus = 'CONSENT_REQUESTED' | 'STARTING' | 'RECORDING' | 'STOPPING' | 'PROCESSING' | 'READY' | 'FAILED';

/** `RoomRecordingStateDto` (BE) — theo NGƯỜI XEM: `consentRequired` = người này CHƯA đồng ý (chưa trả lời yêu cầu / vào sau khi đang ghi). */
export interface RoomRecordingState {
  consentRequired: boolean;
  expiresAt?: string;
  recordingId?: string;
  requestId?: string;
  startedAt?: string;
  startedBy?: string;
  status: RoomRecordingStatus;
}

export type CallRecordingState = 'CONSENT_REQUESTED' | 'CONSENT_PROGRESS' | 'STARTING' | 'RECORDING' | 'STOPPING' | 'STOPPED' | 'FAILED';

/** `call:recording` → `call:{callId}` — tiến độ đồng ý chỉ có SỐ LƯỢNG (không tên người từ chối). */
export interface CallRecordingPayload {
  acceptedCount?: number;
  callId: string;
  declinedCount?: number;
  expiresAt?: string;
  meetingId: string;
  pendingCount?: number;
  recordingId?: string;
  requestId?: string;
  requestedBy?: string;
  startedAt?: string;
  state: CallRecordingState;
}

/** `GET /meetings/:id/recordings/consent-status` (chủ trì/đồng chủ trì). */
export interface ConsentStatus {
  acceptedCount: number;
  connectedCount: number;
  declinedCount: number;
  expiresAt: string;
  pendingCount: number;
  ready: boolean;
  requestId: string;
}
