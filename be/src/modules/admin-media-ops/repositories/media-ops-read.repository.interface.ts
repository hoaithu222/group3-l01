import type {
  CallContext,
  CallEndReasonValue,
  CallMediaKindValue,
  CallModeValue,
  CallRecord,
  CallScopeTypeValue,
  CallStatusValue,
  MeetingPlatformValue,
  MeetingRecord,
  MeetingStatusValue,
  ParticipantCounts,
  SessionAgg,
  SetupCounts,
  WorkspaceMediaStats,
} from "../entities/admin-media.types";

/**
 * Cổng ĐỌC-CHỈ của `admin-media-ops` (p2-07 be.md §1: chỉ `find*`/`count`/`groupBy`/`aggregateRaw`, không có hàm ghi) trên collection của module KHÁC
 * (`Meeting`, `Call`, `CallParticipant`, `MeetingRecording`, `WebhookEvent`, `Channel`, `Conversation`, `Workspace`, `User`) — `select` tối thiểu: không agenda,
 * địa điểm, link, người tham dự, id người dùng của cuộc gọi. CỐ Ý không có tham số `userId` ở bất kỳ hàm lọc nào (OPC-05): không ai lọc được theo người dù thêm DTO sau này.
 */
export interface MeetingListFilter {
  workspaceId?: string;
  /** Tiêu đề (không dấu, đã escape ở repository) hoặc mã họp. */
  q?: string;
  statuses?: MeetingStatusValue[];
  platform?: MeetingPlatformValue;
  from?: Date;
  to?: Date;
  sort: "-startAt" | "startAt" | "-attendeeCount";
  page: number;
  limit: number;
}

export interface CallListFilter {
  workspaceId?: string;
  meetingId?: string;
  scopeType?: CallScopeTypeValue;
  mode?: CallModeValue;
  mediaKind?: CallMediaKindValue;
  statuses?: CallStatusValue[];
  endReasons?: CallEndReasonValue[];
  from?: Date;
  to?: Date;
  sort: "-startedAt" | "startedAt" | "-durationSec" | "-peakParticipants";
  page: number;
  limit: number;
}

export interface IMediaOpsMeetingReader {
  listMeetings(f: MeetingListFilter): Promise<{ rows: MeetingRecord[]; total: number }>;
  /** Cuộc họp chưa xoá mềm. */
  findMeeting(id: string): Promise<MeetingRecord | null>;
  /** Số phiên + tổng thời lượng (giây) theo cuộc họp — MỘT truy vấn `groupBy` cho cả trang. */
  sessionAggs(meetingIds: string[]): Promise<Map<string, SessionAgg>>;
  /** Số bản ghi hình READY chưa xoá theo cuộc họp. */
  readyRecordingCounts(meetingIds: string[]): Promise<Map<string, number>>;
  /** Phiên (cuộc gọi `MEETING`) mới nhất trước. */
  recentSessions(meetingId: string, limit: number): Promise<CallRecord[]>;
  connectedCount(callId: string): Promise<number>;
  recordingSummary(meetingId: string): Promise<{ ready: number; failed: number; totalBytes: number }>;
  workspaceNames(ids: string[]): Promise<Map<string, string>>;
  /** Chỉ id + tên (không email) — chủ trì cuộc họp. */
  userNames(ids: string[]): Promise<Map<string, string>>;
}

export interface IMediaOpsCallReader {
  listCalls(f: CallListFilter): Promise<{ rows: CallRecord[]; total: number }>;
  findCall(id: string): Promise<CallRecord | null>;
  /** Ngữ cảnh hiển thị (loại hội thoại, tên kênh công khai, tiêu đề cuộc họp, tên workspace) cho cả trang — không id người dùng. */
  context(calls: CallRecord[]): Promise<CallContext>;
  /** CHỈ số đếm theo `state` — không trả `userId`. */
  participantCounts(callId: string): Promise<ParticipantCounts>;
  setupCounts(callId: string, withinMs: number): Promise<SetupCounts>;
}

export interface StatsRange {
  from: Date;
  to: Date;
  tz: string;
  workspaceId?: string;
}

export interface CallDayAgg {
  date: string;
  calls: number;
  ringCalls: number;
  answered: number;
  durationSum: number;
  endedWithDuration: number;
}

export interface SetupDayAgg {
  date: string;
  attempts: number;
  success: number;
}

export interface OverviewCounts {
  liveMeetings: number;
  callsToday: number;
  callSeconds7d: number;
  recordingStorageBytes: number;
  egressFailed24h: number;
}

export interface IMediaOpsStatsReader {
  callsByDay(r: StatsRange, withinMs: number): Promise<{ days: CallDayAgg[]; setup: SetupDayAgg[] }>;
  endReasonCounts(r: StatsRange): Promise<Array<{ reason: CallEndReasonValue; count: number }>>;
  workspaceExists(id: string): Promise<boolean>;
  workspaceMediaStats(workspaceId: string, from: Date): Promise<Omit<WorkspaceMediaStats, "days">>;
  overviewCounts(dayStart: Date, since7d: Date, since24h: Date): Promise<OverviewCounts>;
}

export interface WebhookCounts {
  received: number;
  failed: number;
}

export interface IMediaOpsHealthReader {
  lastLiveKitWebhookAt(): Promise<Date | null>;
  liveKitWebhookCountsSince(since: Date): Promise<WebhookCounts>;
  failedRecordingsSince(since: Date): Promise<number>;
}
