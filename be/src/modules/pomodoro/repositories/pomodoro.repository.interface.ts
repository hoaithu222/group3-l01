import type {
  NewPomodoroSession,
  PomodoroHistoryRow,
  PomodoroPhaseValue,
  PomodoroPresenceEntity,
  PomodoroSessionEntity,
  PomodoroSessionPatch,
} from "../entities/pomodoro.interface";
import type { TxHandle } from "./tx";

/** Điều kiện compare-and-set của phiên — không khớp ⇒ hàm ghi trả `null` (service đọc lại rồi quyết định). */
export interface SessionCas {
  version: number;
  /** Phase phải đang là giá trị này (chặn hai lệnh cùng `version` nhưng khác phase — PM-03). */
  phase?: PomodoroPhaseValue;
}

/** `activeKey` trùng (P2002): kênh đã có phiên chưa ENDED — bên thua thấy phiên của bên thắng. */
export class PomodoroActiveConflictError extends Error {
  constructor() {
    super("Pomodoro session activeKey conflict");
    this.name = "PomodoroActiveConflictError";
  }
}

export type JoinMark = "CREATED" | "REJOINED" | "NOOP";

export interface HistoryCursor {
  at: Date;
  id: string;
}

export interface IPomodoroRepository {
  // ── phiên: đọc ────────────────────────────────────────────────────────────
  findById(id: string, tx?: TxHandle): Promise<PomodoroSessionEntity | null>;
  /** Phiên CHƯA ENDED của kênh (tối đa một — `activeKey` unique). */
  findActiveByChannel(channelId: string, tx?: TxHandle): Promise<PomodoroSessionEntity | null>;
  findByCallId(callId: string): Promise<PomodoroSessionEntity | null>;
  /** Phase đang chạy có `phaseEndsAt ≤ before` — quét bù deadline/RECOVERY (cron `pomodoro.reconcile`). */
  listOverdueRunning(before: Date, limit: number): Promise<PomodoroSessionEntity[]>;
  /** Mọi phiên chưa ENDED — đồng bộ chủ phòng, kênh lưu trữ, phòng rỗng quá hạn (cron). */
  listActive(limit: number): Promise<PomodoroSessionEntity[]>;

  // ── phiên: ghi ────────────────────────────────────────────────────────────
  createSession(tx: TxHandle | undefined, session: NewPomodoroSession): Promise<PomodoroSessionEntity>;
  /** CAS: ghi khi khớp `cas`, luôn `version + 1`; ENDED thì đặt `activeKey = "ended:<id>"`. `null` khi không khớp. */
  updateSession(tx: TxHandle | undefined, id: string, cas: SessionCas, patch: PomodoroSessionPatch): Promise<PomodoroSessionEntity | null>;
  /** Gắn `callId` KHÔNG tăng `version` (không đổi gì client thấy — chủ lệnh `expectedVersion` không bị vô hiệu vì việc này). */
  linkCall(id: string, callId: string): Promise<void>;

  // ── hiện diện ─────────────────────────────────────────────────────────────
  findPresence(sessionId: string, userId: string): Promise<PomodoroPresenceEntity | null>;
  listPresence(sessionId: string): Promise<PomodoroPresenceEntity[]>;
  /** Người vào (webhook `participant_joined`/`join`): tạo hoặc mở lại dòng đã rời (+1 gián đoạn); idempotent. */
  markJoined(sessionId: string, userId: string, at: Date): Promise<JoinMark>;
  /** Người rời: chốt `leftAt` + cộng `presentSeconds`; `false` khi đã rời/chưa từng vào (idempotent). */
  markLeft(sessionId: string, userId: string, at: Date): Promise<boolean>;
  /** Vòng tập trung kết thúc tự nhiên: cộng `cyclesAttended` cho người CÓ MẶT từ `phaseStartedAt` (chưa rời, `joinedAt ≤ phaseStartedAt`). */
  incrementCyclesAttended(tx: TxHandle | undefined, sessionId: string, phaseStartedAt: Date): Promise<number>;
  /** Phiên ENDED: chốt mọi dòng hiện diện còn mở. */
  finalizePresence(tx: TxHandle | undefined, sessionId: string, at: Date): Promise<void>;
  setGoal(sessionId: string, userId: string, at: Date, goal: string | null, shared: boolean): Promise<PomodoroPresenceEntity>;

  // ── lịch sử cá nhân ───────────────────────────────────────────────────────
  /** `(joinedAt, id)` giảm dần; trả tối đa `limit + 1` để biết còn nữa không. */
  listHistory(userId: string, cursor: HistoryCursor | null, limit: number): Promise<PomodoroHistoryRow[]>;
}
