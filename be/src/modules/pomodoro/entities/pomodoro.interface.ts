import type { PomodoroPauseReason, PomodoroPhase } from "@prisma/client";

export type PomodoroPhaseValue = PomodoroPhase;
export type PomodoroPauseReasonValue = PomodoroPauseReason;

/** Ba phase có đồng hồ chạy (`phaseEndsAt` khác null). */
export const RUNNING_PHASES = ["FOCUS", "SHORT_BREAK", "LONG_BREAK"] as const;
export type PomodoroRunningPhase = (typeof RUNNING_PHASES)[number];

export const isRunningPhase = (phase: PomodoroPhaseValue | null | undefined): phase is PomodoroRunningPhase =>
  phase === "FOCUS" || phase === "SHORT_BREAK" || phase === "LONG_BREAK";

/** Lý do kết thúc phiên (`PomodoroSession.endReason`, chuỗi để thêm giá trị không cần đổi enum). */
export const POMODORO_END_REASONS = ["HOST_ENDED", "MANAGER_ENDED", "EMPTY_ROOM", "CHANNEL_ARCHIVED"] as const;
export type PomodoroEndReason = (typeof POMODORO_END_REASONS)[number];

/** Cấu hình chu kỳ — snapshot vào phiên lúc tạo, mặc định của kênh ở `Channel.settings.pomodoro`. */
export interface PomodoroConfig {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  /** `false`: hết nghỉ thì tạm dừng ở đầu vòng tập trung kế tiếp chờ chủ phòng bấm tiếp tục. */
  autoAdvance: boolean;
  /** Chủ phòng được bật mic trong FOCUS (mặc định không — P1). */
  hostCanSpeakInFocus: boolean;
}

export interface PomodoroSessionEntity {
  id: string;
  channelId: string;
  workspaceId: string;
  callId: string | null;
  hostUserId: string;
  config: PomodoroConfig;
  phase: PomodoroPhaseValue;
  previousPhase: PomodoroPhaseValue | null;
  phaseStartedAt: Date | null;
  phaseEndsAt: Date | null;
  remainingMs: number | null;
  completedFocusCycles: number;
  skippedFocusCycles: number;
  pauseReason: PomodoroPauseReasonValue | null;
  activeKey: string;
  version: number;
  startedAt: Date | null;
  endedAt: Date | null;
  endReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Phiên mới — `version = 1`, `activeKey = channelId`; mọi trường nullable ghi null TƯỜNG MINH (Prisma+Mongo lọc `{ field: null }`). */
export type NewPomodoroSession = Omit<PomodoroSessionEntity, "activeKey" | "version" | "createdAt" | "updatedAt">;

/** Các trường được ghi bằng CAS; `version` luôn `+ 1` (trừ `patchSession` không tăng — chỉ dùng cho `callId`). */
export type PomodoroSessionPatch = Partial<
  Pick<
    PomodoroSessionEntity,
    | "callId"
    | "hostUserId"
    | "config"
    | "phase"
    | "previousPhase"
    | "phaseStartedAt"
    | "phaseEndsAt"
    | "remainingMs"
    | "completedFocusCycles"
    | "skippedFocusCycles"
    | "pauseReason"
    | "startedAt"
    | "endedAt"
    | "endReason"
  >
>;

export interface PomodoroPresenceEntity {
  id: string;
  sessionId: string;
  userId: string;
  joinedAt: Date;
  leftAt: Date | null;
  presentSeconds: number;
  cyclesAttended: number;
  interruptions: number;
  goal: string | null;
  goalShared: boolean;
}

/** Một dòng lịch sử cá nhân (`GET /me/pomodoro/history`) — presence của tôi + tóm tắt phiên. */
export interface PomodoroHistoryRow {
  presence: PomodoroPresenceEntity;
  session: PomodoroSessionEntity;
}

// ── DTO trả client ───────────────────────────────────────────────────────────

export interface PomodoroParticipantDto {
  userId: string;
  name: string;
  isHost: boolean;
  /** Chỉ có khi người đó bật "Chia sẻ với phòng" (hoặc là chính người xem — chỉ ở REST). */
  goal?: string;
}

/** Quyền publish của một người trong phòng (cùng dạng `CallParticipant.publishPermissions` — adapter `calls` ánh xạ). */
export interface PomodoroPublish {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

/** Luật phòng theo phase (server tính — client chỉ hiển thị, không tự suy). */
export interface PomodoroRulesDto {
  micAllowed: boolean;
  cameraAllowed: boolean;
  screenShareAllowed: boolean;
}

export type PomodoroJoinBlockedReason = "FULL" | "REMOVED" | "ARCHIVED";

/** `myActions` do SERVER tính từ phase + vai trò + quyền kênh (chỉ ở REST — socket là bản chung cho cả phòng). */
export interface PomodoroMyActions {
  canJoin: boolean;
  joinBlockedReason?: PomodoroJoinBlockedReason;
  canStart: boolean;
  canConfigure: boolean;
  canPause: boolean;
  canResume: boolean;
  canSkip: boolean;
  canEnd: boolean;
}

export interface PomodoroSummaryDto {
  startedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  completedFocusCycles: number;
  skippedFocusCycles: number;
}

export interface PomodoroSnapshotDto {
  v: 1;
  /** `null` khi kênh chưa có phiên (WAITING ảo, `version = 0`). */
  sessionId: string | null;
  channelId: string;
  phase: PomodoroPhaseValue;
  previousPhase: PomodoroPhaseValue | null;
  pauseReason: PomodoroPauseReasonValue | null;
  phaseStartedAt: string | null;
  phaseEndsAt: string | null;
  /** Còn lại của phase: PAUSED = giá trị đã lưu; đang chạy = `phaseEndsAt − serverNow` (≥ 0); còn lại `null`. */
  remainingMs: number | null;
  /** Độ dài đầy đủ của phase đang chạy/đang tạm dừng — mẫu số cho vòng tiến độ. */
  phaseDurationMs: number | null;
  completedFocusCycles: number;
  skippedFocusCycles: number;
  config: PomodoroConfig;
  hostUserId: string | null;
  participants: PomodoroParticipantDto[];
  rules: PomodoroRulesDto;
  /** Chỉ khi ENDED. */
  summary?: PomodoroSummaryDto;
  /** Chỉ ở REST cho người xem. */
  myGoal?: { text: string; shared: boolean } | null;
  myActions?: PomodoroMyActions;
  version: number;
  serverNow: string;
}

/** `GET /channels/:id/pomodoro/sessions/:sessionId/summary` — kết quả phiên + số liệu của RIÊNG người xem. */
export interface PomodoroSessionResultDto {
  session: PomodoroSummaryDto & { sessionId: string; channelId: string; config: PomodoroConfig };
  mine: { presentSeconds: number; cyclesAttended: number; interruptions: number; goal: string | null } | null;
  serverNow: string;
}

export interface PomodoroHistoryItemDto {
  sessionId: string;
  channelId: string;
  channelName: string | null;
  workspaceId: string;
  status: PomodoroPhaseValue;
  startedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  joinedAt: string;
  leftAt: string | null;
  presentSeconds: number;
  cyclesAttended: number;
  interruptions: number;
  goal: string | null;
  completedFocusCycles: number;
  skippedFocusCycles: number;
  config: PomodoroConfig;
}

// ── hàng đợi / job (be.md §7) ────────────────────────────────────────────────

/** Mọi job hẹn giờ của phiên chạy ở queue `calls` (cùng họ với phòng thoại); job quét bù chạy ở queue `cron`. */
export const POMODORO_QUEUE = "calls" as const;
export const POMODORO_JOB = {
  /** Hết giờ phase (delayed job bền qua outbox; jobId theo `version` — job cũ tự no-op nhờ CAS). */
  deadline: "pomodoro.deadline",
  /** Phòng rỗng đủ `emptyRoomEndMinutes` thì kết thúc phiên. */
  emptyRoom: "pomodoro.empty-room",
  /** Áp lại luật mic theo phase hiện tại cho mọi người trong phòng (retry khi LiveKit lỗi). */
  mediaSync: "pomodoro.media-sync",
  /** Đồng bộ `hostUserId` với `Call.hostId` sau failover chủ phòng. */
  hostSync: "pomodoro.host-sync",
  /** Cron mỗi phút: quá hạn → chuyển phase/RECOVERY; đồng bộ chủ phòng; kênh lưu trữ; phòng rỗng quá hạn. */
  reconcile: "pomodoro.reconcile",
} as const;
