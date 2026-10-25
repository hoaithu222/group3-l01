import type { PomodoroConfig } from "../entities/pomodoro.interface";
import {
  DEADLINE_TOLERANCE_MS,
  breakAfterFocus,
  isFocusLike,
  phaseDurationMs,
  phaseDurationOf,
  remainingMsOf,
  transition,
  type MachineState,
  type PomodoroEvent,
} from "../services/pomodoro-state-machine";

const MIN = 60_000;
const T0 = new Date("2026-09-25T08:00:00.000Z");
const at = (ms: number): Date => new Date(T0.getTime() + ms);

const CONFIG: PomodoroConfig = { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, cyclesBeforeLongBreak: 4, autoAdvance: true, hostCanSpeakInFocus: false };

const waiting = (over: Partial<MachineState> = {}): MachineState => ({
  phase: "WAITING",
  previousPhase: null,
  phaseStartedAt: null,
  phaseEndsAt: null,
  remainingMs: null,
  completedFocusCycles: 0,
  skippedFocusCycles: 0,
  pauseReason: null,
  startedAt: null,
  config: CONFIG,
  ...over,
});

const focusing = (over: Partial<MachineState> = {}): MachineState =>
  waiting({ phase: "FOCUS", phaseStartedAt: T0, phaseEndsAt: at(25 * MIN), startedAt: T0, ...over });

/** Áp `patch` lên trạng thái (như CAS thật) để đi tiếp nhiều bước. */
function step(s: MachineState, e: PomodoroEvent, now: Date): MachineState {
  const out = transition(s, e, now);
  if (!out.ok) throw new Error(`Chuyển trạng thái thất bại: ${e.type} → ${out.reason}`);
  return { ...s, ...out.patch };
}

describe("pomodoro state machine — bảng transition", () => {
  describe("start", () => {
    it("WAITING → FOCUS: đặt phaseEndsAt = now + focus, ghi startedAt, hẹn deadline", () => {
      const out = transition(waiting(), { type: "start" }, T0);
      expect(out).toMatchObject({ ok: true, patch: { phase: "FOCUS", phaseStartedAt: T0, phaseEndsAt: at(25 * MIN), startedAt: T0, remainingMs: null, pauseReason: null } });
      if (out.ok) expect(out.effects.deadline).toEqual({ at: at(25 * MIN), phase: "FOCUS" });
    });

    it.each(["FOCUS", "SHORT_BREAK", "LONG_BREAK", "PAUSED", "ENDED"] as const)("từ %s → sai phase", (phase) => {
      expect(transition(waiting({ phase }), { type: "start" }, T0)).toEqual({ ok: false, reason: "INVALID_PHASE" });
    });
  });

  describe("deadline", () => {
    it("FOCUS → SHORT_BREAK: completed + 1, mốc bắt đầu = mốc kết thúc DỰ KIẾN (không tích luỹ trễ của job), báo vòng hoàn thành", () => {
      const out = transition(focusing(), { type: "deadline" }, at(25 * MIN + 800));
      expect(out).toMatchObject({
        ok: true,
        patch: { phase: "SHORT_BREAK", completedFocusCycles: 1, phaseStartedAt: at(25 * MIN), phaseEndsAt: at(30 * MIN) },
      });
      if (out.ok) expect(out.effects).toMatchObject({ cycleCompletedFrom: T0, deadline: { at: at(30 * MIN), phase: "SHORT_BREAK" } });
    });

    it("vòng thứ 4 (đủ cyclesBeforeLongBreak) → LONG_BREAK; vòng 1-3 → SHORT_BREAK", () => {
      expect(transition(focusing({ completedFocusCycles: 3 }), { type: "deadline" }, at(25 * MIN))).toMatchObject({ ok: true, patch: { phase: "LONG_BREAK", completedFocusCycles: 4, phaseEndsAt: at(40 * MIN) } });
      for (const done of [0, 1, 2]) {
        expect(transition(focusing({ completedFocusCycles: done }), { type: "deadline" }, at(25 * MIN))).toMatchObject({ ok: true, patch: { phase: "SHORT_BREAK" } });
      }
    });

    it("vòng thứ 8 lại là LONG_BREAK (chu kỳ lặp)", () => {
      expect(transition(focusing({ completedFocusCycles: 7 }), { type: "deadline" }, at(25 * MIN))).toMatchObject({ ok: true, patch: { phase: "LONG_BREAK", completedFocusCycles: 8 } });
    });

    it("BREAK → FOCUS khi autoAdvance, không tăng vòng", () => {
      const s = waiting({ phase: "SHORT_BREAK", phaseStartedAt: at(25 * MIN), phaseEndsAt: at(30 * MIN), completedFocusCycles: 1 });
      expect(transition(s, { type: "deadline" }, at(30 * MIN))).toMatchObject({ ok: true, patch: { phase: "FOCUS", phaseStartedAt: at(30 * MIN), phaseEndsAt: at(55 * MIN) } });
    });

    it("BREAK → PAUSED HOST ở ĐẦU vòng tập trung khi autoAdvance = false (chưa bắt đầu, còn đủ thời lượng)", () => {
      const s = waiting({ phase: "LONG_BREAK", phaseStartedAt: at(25 * MIN), phaseEndsAt: at(40 * MIN), config: { ...CONFIG, autoAdvance: false } });
      const out = transition(s, { type: "deadline" }, at(40 * MIN));
      expect(out).toMatchObject({
        ok: true,
        patch: { phase: "PAUSED", previousPhase: "FOCUS", pauseReason: "HOST", phaseStartedAt: null, phaseEndsAt: null, remainingMs: 25 * MIN },
      });
      if (out.ok) expect(out.effects.deadline).toBeNull();
    });

    it("chưa tới hạn (sớm hơn dung sai) → NOT_DUE; trong dung sai vẫn chuyển", () => {
      expect(transition(focusing(), { type: "deadline" }, at(25 * MIN - DEADLINE_TOLERANCE_MS - 1))).toEqual({ ok: false, reason: "NOT_DUE" });
      expect(transition(focusing(), { type: "deadline" }, at(25 * MIN - DEADLINE_TOLERANCE_MS + 1)).ok).toBe(true);
    });

    it("không ngược về quá khứ khi job trễ dài hơn cả phase kế tiếp", () => {
      const cfg = { ...CONFIG, shortBreakMinutes: 1 };
      const out = transition(focusing({ config: cfg }), { type: "deadline" }, at(25 * MIN + 3 * MIN));
      expect(out).toMatchObject({ ok: true, patch: { phase: "SHORT_BREAK" } });
      if (out.ok) expect(out.patch.phaseEndsAt?.getTime()).toBeGreaterThanOrEqual(at(28 * MIN).getTime());
    });

    it.each(["WAITING", "PAUSED", "ENDED"] as const)("từ %s → sai phase", (phase) => {
      expect(transition(waiting({ phase }), { type: "deadline" }, at(99 * MIN))).toEqual({ ok: false, reason: "INVALID_PHASE" });
    });
  });

  describe("skip (PM-04)", () => {
    it("FOCUS → SHORT_BREAK: KHÔNG tăng completedFocusCycles, tăng skippedFocusCycles, không báo vòng hoàn thành", () => {
      const out = transition(focusing({ completedFocusCycles: 3 }), { type: "skip" }, at(10 * MIN));
      expect(out).toMatchObject({ ok: true, patch: { phase: "SHORT_BREAK", skippedFocusCycles: 1, phaseStartedAt: at(10 * MIN), phaseEndsAt: at(15 * MIN) } });
      if (out.ok) {
        expect(out.patch.completedFocusCycles).toBeUndefined();
        expect(out.effects.cycleCompletedFrom).toBeNull();
      }
    });

    it("bỏ qua vòng thứ 4 KHÔNG nhảy sang nghỉ dài", () => {
      expect(transition(focusing({ completedFocusCycles: 3 }), { type: "skip" }, at(1 * MIN))).toMatchObject({ patch: { phase: "SHORT_BREAK" } });
    });

    it("BREAK → FOCUS ngay (kể cả khi autoAdvance = false vì chủ phòng đã chủ động)", () => {
      const s = waiting({ phase: "LONG_BREAK", phaseStartedAt: T0, phaseEndsAt: at(15 * MIN), config: { ...CONFIG, autoAdvance: false } });
      expect(transition(s, { type: "skip" }, at(3 * MIN))).toMatchObject({ ok: true, patch: { phase: "FOCUS", phaseStartedAt: at(3 * MIN), phaseEndsAt: at(28 * MIN) } });
    });

    it.each(["WAITING", "PAUSED", "ENDED"] as const)("từ %s → sai phase", (phase) => {
      expect(transition(waiting({ phase }), { type: "skip" }, T0)).toEqual({ ok: false, reason: "INVALID_PHASE" });
    });
  });

  describe("pause / resume", () => {
    it("pause: nhớ previousPhase, remainingMs = phần còn lại, xoá phaseEndsAt, lý do HOST", () => {
      expect(transition(focusing(), { type: "pause" }, at(10 * MIN))).toMatchObject({
        ok: true,
        patch: { phase: "PAUSED", previousPhase: "FOCUS", remainingMs: 15 * MIN, phaseEndsAt: null, pauseReason: "HOST" },
      });
    });

    it("resume khôi phục previousPhase với đúng thời gian còn lại, giữ phaseStartedAt cũ", () => {
      const paused = step(focusing(), { type: "pause" }, at(10 * MIN));
      const out = transition(paused, { type: "resume" }, at(20 * MIN));
      expect(out).toMatchObject({ ok: true, patch: { phase: "FOCUS", previousPhase: null, phaseStartedAt: T0, phaseEndsAt: at(35 * MIN), remainingMs: null, pauseReason: null } });
      if (out.ok) expect(out.effects.deadline).toEqual({ at: at(35 * MIN), phase: "FOCUS" });
    });

    it("resume phase CHƯA bắt đầu (chờ sau nghỉ) đặt phaseStartedAt = now", () => {
      const s = waiting({ phase: "PAUSED", previousPhase: "FOCUS", remainingMs: 25 * MIN, phaseStartedAt: null, pauseReason: "HOST" });
      expect(transition(s, { type: "resume" }, at(41 * MIN))).toMatchObject({ patch: { phase: "FOCUS", phaseStartedAt: at(41 * MIN), phaseEndsAt: at(66 * MIN) } });
    });

    it("pause BREAK rồi resume trả về đúng BREAK đó", () => {
      const s = waiting({ phase: "SHORT_BREAK", phaseStartedAt: T0, phaseEndsAt: at(5 * MIN) });
      const paused = step(s, { type: "pause" }, at(2 * MIN));
      expect(paused).toMatchObject({ phase: "PAUSED", previousPhase: "SHORT_BREAK", remainingMs: 3 * MIN });
      expect(transition(paused, { type: "resume" }, at(9 * MIN))).toMatchObject({ patch: { phase: "SHORT_BREAK", phaseEndsAt: at(12 * MIN) } });
    });

    it.each(["WAITING", "PAUSED", "ENDED"] as const)("pause từ %s → sai phase", (phase) => {
      expect(transition(waiting({ phase }), { type: "pause" }, T0)).toEqual({ ok: false, reason: "INVALID_PHASE" });
    });

    it.each(["WAITING", "FOCUS", "SHORT_BREAK", "LONG_BREAK", "ENDED"] as const)("resume từ %s → sai phase", (phase) => {
      expect(transition(waiting({ phase }), { type: "resume" }, T0)).toEqual({ ok: false, reason: "INVALID_PHASE" });
    });
  });

  describe("end", () => {
    it.each(["WAITING", "FOCUS", "SHORT_BREAK", "LONG_BREAK", "PAUSED"] as const)("từ %s → ENDED, ghi endedAt/endReason, chốt hiện diện", (phase) => {
      const out = transition(waiting({ phase, phaseEndsAt: phase === "FOCUS" ? at(25 * MIN) : null }), { type: "end", reason: "HOST_ENDED" }, at(3 * MIN));
      expect(out).toMatchObject({ ok: true, patch: { phase: "ENDED", phaseEndsAt: null, remainingMs: null, pauseReason: null, endedAt: at(3 * MIN), endReason: "HOST_ENDED" } });
      if (out.ok) expect(out.effects.finalizePresence).toBe(true);
    });

    it("đã ENDED → sai phase (bất biến)", () => {
      expect(transition(waiting({ phase: "ENDED" }), { type: "end", reason: "EMPTY_ROOM" }, T0)).toEqual({ ok: false, reason: "INVALID_PHASE" });
    });
  });

  describe("emptyRoom / roomOccupied (PM-07)", () => {
    it("FOCUS rỗng → PAUSED EMPTY_ROOM, đóng băng phần còn lại, hẹn đồng hồ 5 phút", () => {
      const out = transition(focusing(), { type: "emptyRoom" }, at(10 * MIN));
      expect(out).toMatchObject({ ok: true, patch: { phase: "PAUSED", previousPhase: "FOCUS", remainingMs: 15 * MIN, pauseReason: "EMPTY_ROOM", phaseEndsAt: null } });
      if (out.ok) expect(out.effects.armEmptyRoom).toBe(true);
    });

    it("WAITING/PAUSED(HOST) rỗng: giữ phase, đánh dấu EMPTY_ROOM + hẹn 5 phút", () => {
      expect(transition(waiting(), { type: "emptyRoom" }, T0)).toMatchObject({ ok: true, patch: { pauseReason: "EMPTY_ROOM" }, effects: { armEmptyRoom: true } });
      const paused = waiting({ phase: "PAUSED", previousPhase: "FOCUS", remainingMs: 10 * MIN, pauseReason: "HOST" });
      expect(transition(paused, { type: "emptyRoom" }, T0)).toMatchObject({ ok: true, patch: { pauseReason: "EMPTY_ROOM" }, effects: { armEmptyRoom: true } });
    });

    it("đã đánh dấu rỗng → NOOP (phát hiện lặp không kéo dài đồng hồ vô hạn)", () => {
      const s = waiting({ phase: "PAUSED", previousPhase: "FOCUS", remainingMs: 10 * MIN, pauseReason: "EMPTY_ROOM" });
      expect(transition(s, { type: "emptyRoom" }, T0)).toEqual({ ok: false, reason: "NOOP" });
    });

    it("có người quay lại: PAUSED EMPTY_ROOM → PAUSED HOST (chờ chủ phòng tiếp tục); WAITING bỏ cờ; còn lại NOOP", () => {
      expect(transition(waiting({ phase: "PAUSED", previousPhase: "FOCUS", remainingMs: 1, pauseReason: "EMPTY_ROOM" }), { type: "roomOccupied" }, T0)).toMatchObject({ ok: true, patch: { pauseReason: "HOST" } });
      expect(transition(waiting({ pauseReason: "EMPTY_ROOM" }), { type: "roomOccupied" }, T0)).toMatchObject({ ok: true, patch: { pauseReason: null } });
      expect(transition(focusing(), { type: "roomOccupied" }, T0)).toEqual({ ok: false, reason: "NOOP" });
    });

    it("phiên ENDED không nhận emptyRoom", () => {
      expect(transition(waiting({ phase: "ENDED" }), { type: "emptyRoom" }, T0)).toEqual({ ok: false, reason: "INVALID_PHASE" });
    });
  });

  describe("recover (PM-05)", () => {
    it("phase quá hạn → PAUSED RECOVERY, KHÔNG tăng vòng, phase làm lại từ đầu (remaining = đủ thời lượng, phaseStartedAt = null)", () => {
      const out = transition(focusing({ completedFocusCycles: 2 }), { type: "recover" }, at(25 * MIN + 10 * MIN));
      expect(out).toMatchObject({
        ok: true,
        patch: { phase: "PAUSED", previousPhase: "FOCUS", pauseReason: "RECOVERY", remainingMs: 25 * MIN, phaseStartedAt: null, phaseEndsAt: null },
      });
      if (out.ok) {
        expect(out.patch.completedFocusCycles).toBeUndefined();
        expect(out.effects.cycleCompletedFrom).toBeNull();
      }
    });

    it("BREAK quá hạn cũng làm lại đủ thời lượng BREAK", () => {
      const s = waiting({ phase: "LONG_BREAK", phaseStartedAt: T0, phaseEndsAt: at(15 * MIN) });
      expect(transition(s, { type: "recover" }, at(60 * MIN))).toMatchObject({ patch: { previousPhase: "LONG_BREAK", remainingMs: 15 * MIN } });
    });

    it("chưa quá hạn → NOT_DUE; không ở phase chạy → sai phase", () => {
      expect(transition(focusing(), { type: "recover" }, at(10 * MIN))).toEqual({ ok: false, reason: "NOT_DUE" });
      expect(transition(waiting({ phase: "PAUSED" }), { type: "recover" }, T0)).toEqual({ ok: false, reason: "INVALID_PHASE" });
    });

    it("resume sau RECOVERY chạy lại đủ thời lượng từ lúc bấm (không cộng vòng ảo)", () => {
      const recovered = step(focusing(), { type: "recover" }, at(40 * MIN));
      expect(transition(recovered, { type: "resume" }, at(41 * MIN))).toMatchObject({ patch: { phase: "FOCUS", phaseStartedAt: at(41 * MIN), phaseEndsAt: at(66 * MIN) } });
    });
  });

  describe("một phiên đầy đủ", () => {
    it("4 vòng tập trung → nghỉ dài → vòng 5 lại nghỉ ngắn; skip không lệch bộ đếm", () => {
      let s = step(waiting(), { type: "start" }, T0);
      let now = at(25 * MIN);
      const seen: string[] = [];
      for (let i = 0; i < 4; i += 1) {
        s = step(s, { type: "deadline" }, now);
        seen.push(s.phase);
        now = s.phaseEndsAt as Date;
        s = step(s, { type: "deadline" }, now);
        seen.push(s.phase);
        now = s.phaseEndsAt as Date;
      }
      expect(seen).toEqual(["SHORT_BREAK", "FOCUS", "SHORT_BREAK", "FOCUS", "SHORT_BREAK", "FOCUS", "LONG_BREAK", "FOCUS"]);
      expect(s.completedFocusCycles).toBe(4);
      s = step(s, { type: "skip" }, now); // bỏ qua vòng 5
      expect(s).toMatchObject({ phase: "SHORT_BREAK", completedFocusCycles: 4, skippedFocusCycles: 1 });
    });
  });
});

describe("pomodoro state machine — hàm phụ", () => {
  it("phaseDurationMs theo cấu hình; breakAfterFocus", () => {
    expect(phaseDurationMs("FOCUS", CONFIG)).toBe(25 * MIN);
    expect(phaseDurationMs("SHORT_BREAK", CONFIG)).toBe(5 * MIN);
    expect(phaseDurationMs("LONG_BREAK", CONFIG)).toBe(15 * MIN);
    expect(breakAfterFocus(0, CONFIG)).toBe("SHORT_BREAK");
    expect(breakAfterFocus(4, CONFIG)).toBe("LONG_BREAK");
    expect(breakAfterFocus(5, CONFIG)).toBe("SHORT_BREAK");
    expect(breakAfterFocus(2, { ...CONFIG, cyclesBeforeLongBreak: 2 })).toBe("LONG_BREAK");
  });

  it("remainingMsOf: đang chạy = phaseEndsAt − now (≥ 0), PAUSED = remainingMs, WAITING/ENDED = null", () => {
    expect(remainingMsOf(focusing(), at(10 * MIN))).toBe(15 * MIN);
    expect(remainingMsOf(focusing(), at(99 * MIN))).toBe(0);
    expect(remainingMsOf(waiting({ phase: "PAUSED", remainingMs: 7 }), T0)).toBe(7);
    expect(remainingMsOf(waiting(), T0)).toBeNull();
    expect(remainingMsOf(waiting({ phase: "ENDED" }), T0)).toBeNull();
  });

  it("phaseDurationOf: mẫu số vòng tiến độ (phase chạy hoặc phase sắp chạy lại)", () => {
    expect(phaseDurationOf(focusing())).toBe(25 * MIN);
    expect(phaseDurationOf(waiting({ phase: "PAUSED", previousPhase: "LONG_BREAK" }))).toBe(15 * MIN);
    expect(phaseDurationOf(waiting())).toBeNull();
  });

  it("isFocusLike: FOCUS và PAUSED(previous FOCUS) khoá mic; BREAK/WAITING/PAUSED(previous BREAK) thì không", () => {
    expect(isFocusLike("FOCUS", null)).toBe(true);
    expect(isFocusLike("PAUSED", "FOCUS")).toBe(true);
    expect(isFocusLike("PAUSED", "SHORT_BREAK")).toBe(false);
    expect(isFocusLike("SHORT_BREAK", null)).toBe(false);
    expect(isFocusLike("WAITING", null)).toBe(false);
    expect(isFocusLike("ENDED", null)).toBe(false);
  });
});
