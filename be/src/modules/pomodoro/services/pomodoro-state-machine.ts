import {
  isRunningPhase,
  type PomodoroConfig,
  type PomodoroEndReason,
  type PomodoroPauseReasonValue,
  type PomodoroPhaseValue,
  type PomodoroRunningPhase,
  type PomodoroSessionPatch,
} from "../entities/pomodoro.interface";

/**
 * Máy trạng thái Pomodoro THUẦN (p5-02 be.md §5 bảng transition) — không I/O, không đồng hồ ẩn: mọi hàm nhận `now` để test tất định. Service chỉ
 * nối `transition()` với CAS `(version, phase)` + outbox. Quy ước phase:
 *  - đang chạy (`FOCUS`/`SHORT_BREAK`/`LONG_BREAK`): `phaseEndsAt` khác null, `remainingMs` null;
 *  - `PAUSED`: `previousPhase` = phase sẽ chạy tiếp, `remainingMs` = phần còn lại, `phaseEndsAt` null; `phaseStartedAt` null nghĩa là phase
 *    CHƯA bắt đầu (chờ chủ phòng bấm tiếp tục sau nghỉ khi `autoAdvance = false`, hoặc bắt đầu lại sau RECOVERY);
 *  - `ENDED`: bất biến.
 * Chuyển phase tự động tính từ MỐC DỰ KIẾN (`phaseEndsAt` cũ) chứ không phải `now`, để độ trễ của job không tích luỹ thành lệch chu kỳ.
 */

const MINUTE_MS = 60_000;
/** Job chạy sớm hơn mốc tối đa bấy nhiêu ms vẫn coi là tới hạn (lệch đồng hồ giữa instance/Redis). */
export const DEADLINE_TOLERANCE_MS = 2000;

export interface MachineState {
  phase: PomodoroPhaseValue;
  previousPhase: PomodoroPhaseValue | null;
  phaseStartedAt: Date | null;
  phaseEndsAt: Date | null;
  remainingMs: number | null;
  completedFocusCycles: number;
  skippedFocusCycles: number;
  pauseReason: PomodoroPauseReasonValue | null;
  startedAt: Date | null;
  config: PomodoroConfig;
}

export type PomodoroEvent =
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "skip" }
  | { type: "end"; reason: PomodoroEndReason }
  | { type: "deadline" }
  | { type: "emptyRoom" }
  | { type: "roomOccupied" }
  | { type: "recover" };

export interface TransitionEffects {
  /** Hẹn job deadline cho phase mới (`at` = mốc kết thúc dự kiến). */
  deadline: { at: Date; phase: PomodoroRunningPhase } | null;
  /** Hẹn `pomodoro.empty-room`: sau `emptyRoomEndMinutes` mà phòng còn rỗng thì kết thúc phiên. */
  armEmptyRoom: boolean;
  /** Vòng tập trung vừa kết thúc TỰ NHIÊN — mốc bắt đầu của vòng (cộng `cyclesAttended` cho người có mặt từ đó). */
  cycleCompletedFrom: Date | null;
  /** Phiên vừa ENDED: chốt thời gian hiện diện còn mở. */
  finalizePresence: boolean;
}

/** `NOOP`: sự kiện hệ thống không đổi gì (đã ở trạng thái đích) — khác `INVALID_PHASE` (lệnh sai phase → lỗi cho người dùng). */
export type TransitionOutcome =
  | { ok: true; patch: PomodoroSessionPatch; effects: TransitionEffects }
  | { ok: false; reason: "INVALID_PHASE" | "NOT_DUE" | "NOOP" };

export function phaseDurationMs(phase: PomodoroRunningPhase, config: PomodoroConfig): number {
  const minutes = phase === "FOCUS" ? config.focusMinutes : phase === "SHORT_BREAK" ? config.shortBreakMinutes : config.longBreakMinutes;
  return minutes * MINUTE_MS;
}

/** Nghỉ sau vòng tập trung thứ `completedAfter`: nghỉ dài khi đủ `cyclesBeforeLongBreak` vòng. */
export function breakAfterFocus(completedAfter: number, config: PomodoroConfig): "SHORT_BREAK" | "LONG_BREAK" {
  return completedAfter > 0 && completedAfter % config.cyclesBeforeLongBreak === 0 ? "LONG_BREAK" : "SHORT_BREAK";
}

const noEffects = (): TransitionEffects => ({ deadline: null, armEmptyRoom: false, cycleCompletedFrom: null, finalizePresence: false });

/** Patch đưa phiên vào một phase ĐANG CHẠY bắt đầu lúc `startedAt`. */
function runningPatch(phase: PomodoroRunningPhase, startedAt: Date, config: PomodoroConfig, now: Date): { patch: PomodoroSessionPatch; endsAt: Date } {
  // Không để mốc kết thúc nằm trong quá khứ (job trễ dài hơn cả phase ngắn): job kế tiếp chạy ngay thay vì `remaining < 0`.
  const endsAt = new Date(Math.max(startedAt.getTime() + phaseDurationMs(phase, config), now.getTime()));
  return {
    patch: { phase, previousPhase: null, phaseStartedAt: startedAt, phaseEndsAt: endsAt, remainingMs: null, pauseReason: null },
    endsAt,
  };
}

function withDeadline(patch: PomodoroSessionPatch, endsAt: Date, phase: PomodoroRunningPhase, extra: Partial<TransitionEffects> = {}): TransitionOutcome {
  return { ok: true, patch, effects: { ...noEffects(), ...extra, deadline: { at: endsAt, phase } } };
}

const invalid: TransitionOutcome = { ok: false, reason: "INVALID_PHASE" };

/** Còn lại của phase hiện tại (ms) — dùng cho `pause`/snapshot. */
export function remainingMsOf(s: Pick<MachineState, "phase" | "phaseEndsAt" | "remainingMs">, now: Date): number | null {
  if (s.phase === "PAUSED") return s.remainingMs;
  if (isRunningPhase(s.phase) && s.phaseEndsAt) return Math.max(0, s.phaseEndsAt.getTime() - now.getTime());
  return null;
}

/** Độ dài đầy đủ của phase đang chạy hoặc sắp chạy lại (PAUSED) — mẫu số vòng tiến độ ở client. */
export function phaseDurationOf(s: Pick<MachineState, "phase" | "previousPhase" | "config">): number | null {
  if (isRunningPhase(s.phase)) return phaseDurationMs(s.phase, s.config);
  if (s.phase === "PAUSED" && isRunningPhase(s.previousPhase)) return phaseDurationMs(s.previousPhase, s.config);
  return null;
}

/** Phiên đang "khoá mic": FOCUS, hoặc PAUSED sắp/đang trở lại FOCUS (tạm dừng giữa vòng vẫn giữ im lặng). */
export function isFocusLike(phase: PomodoroPhaseValue, previousPhase: PomodoroPhaseValue | null): boolean {
  return phase === "FOCUS" || (phase === "PAUSED" && previousPhase === "FOCUS");
}

export function transition(s: MachineState, event: PomodoroEvent, now: Date): TransitionOutcome {
  const c = s.config;
  switch (event.type) {
    case "start": {
      if (s.phase !== "WAITING") return invalid;
      const { patch, endsAt } = runningPatch("FOCUS", now, c, now);
      return withDeadline({ ...patch, startedAt: s.startedAt ?? now }, endsAt, "FOCUS");
    }

    case "pause": {
      if (!isRunningPhase(s.phase)) return invalid;
      return {
        ok: true,
        effects: noEffects(),
        patch: {
          phase: "PAUSED",
          previousPhase: s.phase,
          remainingMs: remainingMsOf(s, now) ?? phaseDurationMs(s.phase, c),
          phaseEndsAt: null,
          pauseReason: "HOST",
        },
      };
    }

    case "resume": {
      if (s.phase !== "PAUSED" || !isRunningPhase(s.previousPhase)) return invalid;
      const remaining = s.remainingMs ?? phaseDurationMs(s.previousPhase, c);
      const endsAt = new Date(now.getTime() + remaining);
      return withDeadline(
        { phase: s.previousPhase, previousPhase: null, phaseStartedAt: s.phaseStartedAt ?? now, phaseEndsAt: endsAt, remainingMs: null, pauseReason: null },
        endsAt,
        s.previousPhase
      );
    }

    case "skip": {
      if (s.phase === "FOCUS") {
        const { patch, endsAt } = runningPatch("SHORT_BREAK", now, c, now);
        // Bỏ qua vòng tập trung KHÔNG tính vòng hoàn thành (PM-04) và không sinh nghỉ dài.
        return withDeadline({ ...patch, skippedFocusCycles: s.skippedFocusCycles + 1 }, endsAt, "SHORT_BREAK");
      }
      if (s.phase === "SHORT_BREAK" || s.phase === "LONG_BREAK") {
        const { patch, endsAt } = runningPatch("FOCUS", now, c, now);
        return withDeadline(patch, endsAt, "FOCUS");
      }
      return invalid;
    }

    case "deadline": {
      if (!isRunningPhase(s.phase) || !s.phaseEndsAt) return invalid;
      if (now.getTime() < s.phaseEndsAt.getTime() - DEADLINE_TOLERANCE_MS) return { ok: false, reason: "NOT_DUE" };
      const plannedEnd = s.phaseEndsAt;
      if (s.phase === "FOCUS") {
        const completed = s.completedFocusCycles + 1;
        const next = breakAfterFocus(completed, c);
        const { patch, endsAt } = runningPatch(next, plannedEnd, c, now);
        return withDeadline({ ...patch, completedFocusCycles: completed }, endsAt, next, { cycleCompletedFrom: s.phaseStartedAt });
      }
      if (c.autoAdvance) {
        const { patch, endsAt } = runningPatch("FOCUS", plannedEnd, c, now);
        return withDeadline(patch, endsAt, "FOCUS");
      }
      // Hết nghỉ mà `autoAdvance = false`: dừng ở ĐẦU vòng tập trung kế tiếp (chưa bắt đầu) chờ chủ phòng.
      return {
        ok: true,
        effects: noEffects(),
        patch: {
          phase: "PAUSED",
          previousPhase: "FOCUS",
          phaseStartedAt: null,
          phaseEndsAt: null,
          remainingMs: phaseDurationMs("FOCUS", c),
          pauseReason: "HOST",
        },
      };
    }

    case "emptyRoom": {
      if (s.phase === "ENDED") return invalid;
      // Đã đánh dấu rỗng (đang đếm 5 phút): không hẹn lại — phát hiện rỗng lặp lại (webhook trùng, cron) không được kéo dài đồng hồ vô hạn.
      if (s.pauseReason === "EMPTY_ROOM") return { ok: false, reason: "NOOP" };
      const effects = { ...noEffects(), armEmptyRoom: true };
      if (isRunningPhase(s.phase)) {
        return {
          ok: true,
          effects,
          patch: {
            phase: "PAUSED",
            previousPhase: s.phase,
            remainingMs: remainingMsOf(s, now) ?? phaseDurationMs(s.phase, c),
            phaseEndsAt: null,
            pauseReason: "EMPTY_ROOM",
          },
        };
      }
      // WAITING/PAUSED(HOST|RECOVERY) mà phòng rỗng: giữ phase, chỉ đánh dấu `EMPTY_ROOM` (WAITING dùng làm cờ "đang đếm") + hẹn 5 phút.
      return { ok: true, effects, patch: { pauseReason: "EMPTY_ROOM" } };
    }

    case "roomOccupied": {
      // Có người vào lại khi phòng đang được đếm rỗng: huỷ đếm (version mới làm job cũ no-op). Phiên PAUSED vẫn chờ chủ phòng bấm tiếp tục.
      if (s.pauseReason !== "EMPTY_ROOM" || s.phase === "ENDED") return { ok: false, reason: "NOOP" };
      return { ok: true, effects: noEffects(), patch: { pauseReason: s.phase === "PAUSED" ? "HOST" : null } };
    }

    case "recover": {
      if (!isRunningPhase(s.phase) || !s.phaseEndsAt) return invalid;
      if (now.getTime() <= s.phaseEndsAt.getTime()) return { ok: false, reason: "NOT_DUE" };
      // Quá hạn nhiều (BE/worker chết): KHÔNG cộng vòng ảo — tạm dừng, phase bắt đầu lại từ đầu khi chủ phòng bấm tiếp tục.
      return {
        ok: true,
        effects: noEffects(),
        patch: {
          phase: "PAUSED",
          previousPhase: s.phase,
          phaseStartedAt: null,
          phaseEndsAt: null,
          remainingMs: phaseDurationMs(s.phase, c),
          pauseReason: "RECOVERY",
        },
      };
    }

    case "end": {
      if (s.phase === "ENDED") return invalid;
      return {
        ok: true,
        effects: { ...noEffects(), finalizePresence: true },
        patch: { phase: "ENDED", previousPhase: null, phaseEndsAt: null, remainingMs: null, pauseReason: null, endedAt: now, endReason: event.reason },
      };
    }
  }
}
