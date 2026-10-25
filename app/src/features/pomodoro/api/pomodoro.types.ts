/**
 * Kiểu dữ liệu `pomodoro` — khớp `PomodoroSnapshotDto` và các DTO của BE p5-02 (`be/src/modules/pomodoro/entities/pomodoro.interface.ts`).
 * ⚠️ Mọi mốc giờ là ISO-8601 theo đồng hồ SERVER; mọi snapshot mang `serverNow` để client tính lệch đồng hồ rồi CHỈ vẽ (không tự chuyển phase).
 */
export type PomodoroPhase = 'ENDED' | 'FOCUS' | 'LONG_BREAK' | 'PAUSED' | 'SHORT_BREAK' | 'WAITING';
export type PomodoroPauseReason = 'EMPTY_ROOM' | 'HOST' | 'RECOVERY';
export type PomodoroRunningPhase = 'FOCUS' | 'LONG_BREAK' | 'SHORT_BREAK';

export interface PomodoroConfig {
  autoAdvance: boolean;
  cyclesBeforeLongBreak: number;
  focusMinutes: number;
  hostCanSpeakInFocus: boolean;
  longBreakMinutes: number;
  shortBreakMinutes: number;
}

export interface PomodoroParticipant {
  /** Chỉ có khi người đó bật "Chia sẻ với phòng" (hoặc là chính tôi — chỉ ở REST). */
  goal?: string;
  isHost: boolean;
  name: string;
  userId: string;
}

/** Luật phòng theo phase do SERVER tính — client chỉ hiển thị. */
export interface PomodoroRules {
  cameraAllowed: boolean;
  micAllowed: boolean;
  screenShareAllowed: boolean;
}

export type PomodoroJoinBlockedReason = 'ARCHIVED' | 'FULL' | 'REMOVED';

/** `myActions` do SERVER tính (chỉ ở REST — bản socket là bản chung cả phòng). */
export interface PomodoroMyActions {
  canConfigure: boolean;
  canEnd: boolean;
  canJoin: boolean;
  canPause: boolean;
  canResume: boolean;
  canSkip: boolean;
  canStart: boolean;
  joinBlockedReason?: PomodoroJoinBlockedReason;
}

export interface PomodoroSummary {
  completedFocusCycles: number;
  endReason: string | null;
  endedAt: string | null;
  skippedFocusCycles: number;
  startedAt: string | null;
}

export interface PomodoroSnapshot {
  channelId: string;
  completedFocusCycles: number;
  config: PomodoroConfig;
  hostUserId: string | null;
  /** Chỉ ở REST cho người xem. */
  myActions?: PomodoroMyActions;
  /** Chỉ ở REST cho người xem. */
  myGoal?: { shared: boolean; text: string } | null;
  participants: PomodoroParticipant[];
  pauseReason: PomodoroPauseReason | null;
  phase: PomodoroPhase;
  phaseDurationMs: number | null;
  phaseEndsAt: string | null;
  phaseStartedAt: string | null;
  previousPhase: PomodoroPhase | null;
  /** PAUSED: phần còn lại đã lưu; đang chạy: `phaseEndsAt − serverNow`; còn lại `null`. */
  remainingMs: number | null;
  rules: PomodoroRules;
  serverNow: string;
  /** `null` khi kênh chưa có phiên (WAITING ảo, `version = 0`). */
  sessionId: string | null;
  skippedFocusCycles: number;
  summary?: PomodoroSummary;
  v: 1;
  version: number;
}

export type PomodoroCommandKind = 'end' | 'pause' | 'resume' | 'skip' | 'start';

export interface PomodoroCommandBody {
  commandId: string;
  expectedVersion: number;
}

export interface PomodoroConfigPayload {
  autoAdvance: boolean;
  cyclesBeforeLongBreak: number;
  expectedVersion?: number;
  focusMinutes: number;
  hostCanSpeakInFocus: boolean;
  longBreakMinutes: number;
  shortBreakMinutes: number;
}

export interface PomodoroGoalPayload {
  shared: boolean;
  text: string;
}

/** `POST /channels/:id/pomodoro/join` — cùng dạng kết quả vào phòng thoại: token LiveKit + `CallDto` (chỉ cần `id`). */
export interface PomodoroJoinResult {
  call: { id: string };
  expiresAt: string;
  livekitUrl: string;
  serverNow: string;
  snapshot: PomodoroSnapshot;
  token: string;
}

export interface PomodoroTokenResult {
  expiresAt: string;
  livekitUrl: string;
  token: string;
}

export interface PomodoroSessionResult {
  mine: { cyclesAttended: number; goal: string | null; interruptions: number; presentSeconds: number } | null;
  serverNow: string;
  session: PomodoroSummary & { channelId: string; config: PomodoroConfig; sessionId: string };
}

export interface PomodoroHistoryItem {
  channelId: string;
  channelName: string | null;
  completedFocusCycles: number;
  config: PomodoroConfig;
  cyclesAttended: number;
  endReason: string | null;
  endedAt: string | null;
  goal: string | null;
  interruptions: number;
  joinedAt: string;
  leftAt: string | null;
  presentSeconds: number;
  sessionId: string;
  skippedFocusCycles: number;
  startedAt: string | null;
  status: PomodoroPhase;
  workspaceId: string;
}

export interface CursorMeta {
  hasMore: boolean;
  limit: number;
  nextCursor: string | null;
}

export interface PomodoroHistoryPage {
  items: PomodoroHistoryItem[];
  meta: CursorMeta;
}

/** Sự kiện `pomodoro:updated` (S→C `ch:{id}`) = snapshot CHUNG cả phòng (không `myGoal`/`myActions`). */
export type PomodoroUpdatedEvent = PomodoroSnapshot;
