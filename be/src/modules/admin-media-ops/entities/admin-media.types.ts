/**
 * Kiểu của module `admin-media-ops` (p2-07): (1) BẢN GHI ĐỌC từ repository — `select` tối thiểu, cố ý KHÔNG có agenda/địa điểm/link/người tham dự/id người dùng
 * của cuộc gọi; (2) DTO trả cho admin (dựng CHỈ qua `AdminMediaRedactor`, không bao giờ spread bản ghi gốc). Chuỗi thời gian là ISO 8601.
 */
export type MeetingStatusValue = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
export type MeetingPlatformValue = "INTERNAL" | "ZOOM" | "TEAMS" | "GOOGLE_MEET" | "OTHER";
export type CallScopeTypeValue = "CONVERSATION" | "CHANNEL" | "MEETING";
export type CallModeValue = "RING" | "ROOM";
export type CallMediaKindValue = "AUDIO" | "VIDEO";
export type CallStatusValue = "RINGING" | "ACTIVE" | "ENDED";
export type CallEndReasonValue =
  | "COMPLETED" | "CANCELLED" | "NO_ANSWER" | "DECLINED" | "BUSY" | "FAILED" | "REVOKED" | "ARCHIVED" | "HOST_ENDED" | "FORCE_ENDED" | "EMPTY" | "MAX_DURATION";
export type MeetingEndReasonValue = "HOST_ENDED" | "EMPTY" | "MAX_DURATION" | "FORCE_ENDED" | "WORKSPACE_ARCHIVED" | "HOST_REMOVED";

// ── Bản ghi đọc (repository → service) ────────────────────────────────────────

export interface MeetingRecord {
  id: string;
  code: string;
  title: string;
  workspaceId: string;
  hostId: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: MeetingStatusValue;
  platform: MeetingPlatformValue;
  attendeeCount: number;
  endReason: MeetingEndReasonValue | null;
  cancelledAt: Date | null;
  currentCallId: string | null;
  lockedAt: Date | null;
  version: number;
}

export interface CallRecord {
  id: string;
  scopeType: CallScopeTypeValue;
  scopeId: string;
  workspaceId: string | null;
  mode: CallModeValue;
  mediaKind: CallMediaKindValue;
  status: CallStatusValue;
  endReason: CallEndReasonValue | null;
  startedAt: Date;
  endedAt: Date | null;
  durationSec: number | null;
  peakParticipants: number;
  invitedCount: number;
  version: number;
}

export interface SessionAgg {
  sessionCount: number;
  totalDurationSec: number;
}

export interface CallContext {
  workspaceNames: Map<string, string>;
  conversationKinds: Map<string, "DIRECT" | "GROUP">;
  channels: Map<string, { name: string; visibility: "PUBLIC" | "PRIVATE" }>;
  meetings: Map<string, { code: string; title: string }>;
}

/** Đếm người tham gia của MỘT cuộc gọi theo trạng thái — CHỈ số, không userId. */
export type ParticipantCounts = Record<string, number>;

export interface SetupCounts {
  attempts: number;
  successWithin: number;
}

// ── DTO cho admin ─────────────────────────────────────────────────────────────

export interface AdminMeetingRow {
  id: string;
  code: string;
  title: string;
  workspace: { id: string; name: string | null };
  host: { id: string; name: string | null };
  startAt: string;
  endAt: string;
  timezone: string;
  status: MeetingStatusValue;
  platform: MeetingPlatformValue;
  attendeeCount: number;
  sessionCount: number;
  totalDurationSec: number;
  recordingCount: number;
  endReason?: MeetingEndReasonValue;
  cancelledAt?: string;
}

export interface AdminMeetingSession {
  callId: string;
  startedAt: string;
  endedAt?: string;
  durationSec?: number;
  peakParticipants: number;
  endReason?: CallEndReasonValue;
}

export interface AdminMeetingDetail extends AdminMeetingRow {
  currentSession?: { callId: string; startedAt: string; connectedCount: number; lockedAt?: string };
  sessions: AdminMeetingSession[];
  recordings: { ready: number; failed: number; totalBytes: number };
}

export interface AdminCallRow {
  id: string;
  label: string;
  scopeType: CallScopeTypeValue;
  mode: CallModeValue;
  mediaKind: CallMediaKindValue;
  status: CallStatusValue;
  endReason?: CallEndReasonValue;
  workspace?: { id: string; name: string | null };
  startedAt: string;
  endedAt?: string;
  durationSec?: number;
  peakParticipants: number;
  invitedCount: number;
  meeting?: { id: string; code: string; title: string };
  channel?: { id: string; name: string };
}

export interface AdminCallDetail extends AdminCallRow {
  participantStats: { invited: number; answered: number; connected: number; missed: number; declined: number; busy: number; removed: number };
  setup: { attempts: number; successWithin20s: number };
  roomActive?: boolean;
}

export interface CallStatsTotals {
  calls: number;
  ringCalls: number;
  roomCalls: number;
  minutes: number;
  answerRate: number | null;
  setupSuccessRate: number | null;
  avgDurationSec: number | null;
}

export interface CallStats {
  range: { from: string; to: string; tz: string };
  serverNow: string;
  totals: CallStatsTotals;
  byDay: Array<{ date: string; calls: number; minutes: number; answerRate: number | null; setupSuccessRate: number | null; avgDurationSec: number | null }>;
  byEndReason: Array<{ reason: CallEndReasonValue; count: number }>;
}

export interface WorkspaceMediaStats {
  days: number;
  meetings: { scheduled: number; held: number; cancelled: number; totalMinutes: number };
  calls: { total: number; ring: number; room: number; minutes: number };
  recordings: { ready: number; storageBytes: number };
}

export type HealthState = "OK" | "DEGRADED" | "DOWN" | "DISABLED" | "UNKNOWN";

export interface MediaHealth {
  status: HealthState;
  checkedAt: string;
  livekit: { status: HealthState; latencyMs?: number; rooms?: number; participants?: number; error?: string };
  egress: { status: HealthState; active?: number; failed24h?: number; error?: string };
  webhook: { status: HealthState; lastReceivedAt?: string; received1h: number; failed1h: number };
  turn: { status: HealthState; lastProbeAt?: string; lastProbeOk?: boolean; error?: string };
  /** `error` (đã làm sạch) khi không đọc được hàng đợi — số đếm khi đó là 0 và KHÔNG tính vào trạng thái tổng. */
  queues: Record<"calls" | "media", { waiting: number; delayed: number; failed: number; error?: string }>;
}
