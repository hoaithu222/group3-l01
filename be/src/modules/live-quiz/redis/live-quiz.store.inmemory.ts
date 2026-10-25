import type { LiveQuizStatusValue, QuizMeta, QuizPlayer, QuizScoreRow, StoredQuestion } from "../entities/live-quiz.interface";
import { INITIAL_COMPOSITE, TIEBREAK_BASE, decodeComposite } from "../services/live-quiz-scoring";
import { newSessionState, type SessionState } from "./live-quiz.store.inmemory-state";
import type { AdvanceParams, AdvanceResult, AnswerParams, AnswerResult, FinishResult, ILiveQuizStore, JoinResult, QuizInit } from "./live-quiz.store.types";

/**
 * Bản `ILiveQuizStore` trong bộ nhớ (test đơn vị/tích hợp không cần Redis) — mô phỏng ĐÚNG từng script Lua ở `live-quiz.lua.ts`
 * (cùng thứ tự kiểm tra, cùng mã trả về). Node đơn luồng nên mỗi phương thức không có `await` giữa chừng là nguyên tử như `EVAL`.
 * `now` thay cho `redis.call('TIME')` — test điều khiển đồng hồ bằng một hàm chung với service.
 */
export class InMemoryLiveQuizStore implements ILiveQuizStore {
  private readonly sessions = new Map<string, SessionState>();
  private readonly pins = new Map<string, { sessionId: string; expiresAtMs: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Test: mô phỏng khoá Redis đã hết hạn/mất. */
  drop(id: string): void {
    this.sessions.delete(id);
  }

  private s(id: string): SessionState | null {
    const st = this.sessions.get(id);
    if (!st) return null;
    if (st.expiresAtMs <= this.now()) {
      this.sessions.delete(id);
      return null;
    }
    return st;
  }

  async claimPin(pin: string, sessionId: string, ttlSeconds: number): Promise<boolean> {
    const cur = this.pins.get(pin);
    if (cur && cur.expiresAtMs > this.now()) return false;
    this.pins.set(pin, { sessionId, expiresAtMs: this.now() + ttlSeconds * 1000 });
    return true;
  }

  async resolvePin(pin: string): Promise<string | null> {
    const cur = this.pins.get(pin);
    return cur && cur.expiresAtMs > this.now() ? cur.sessionId : null;
  }

  async releasePin(pin: string): Promise<void> {
    this.pins.delete(pin);
  }

  async init(input: QuizInit): Promise<void> {
    this.sessions.set(input.id, newSessionState(input, this.now() + input.ttlSeconds * 1000));
  }

  async getMeta(id: string): Promise<QuizMeta | null> {
    const st = this.s(id);
    return st ? { ...st.meta } : null;
  }

  async join(id: string, player: QuizPlayer, max: number): Promise<JoinResult> {
    const st = this.s(id);
    if (!st) return { kind: "GONE" };
    if (st.meta.status === "FINISHED" || st.meta.status === "CANCELLED") return { kind: "ENDED" };
    if (st.kicked.has(player.userId)) return { kind: "KICKED" };
    if (st.players.has(player.userId)) return { kind: "EXISTS", playersCount: st.players.size };
    if (st.players.size >= max) return { kind: "FULL" };
    const { userId, ...rest } = player;
    st.players.set(userId, rest);
    if (!st.scores.has(userId)) st.scores.set(userId, INITIAL_COMPOSITE);
    return { kind: "JOINED", playersCount: st.players.size };
  }

  async players(id: string): Promise<QuizPlayer[]> {
    const st = this.s(id);
    if (!st) return [];
    return [...st.players.entries()].map(([userId, p]) => ({ userId, ...p })).sort((a, b) => a.joinedAtMs - b.joinedAtMs);
  }

  async hasPlayer(id: string, userId: string): Promise<boolean> {
    return this.s(id)?.players.has(userId) ?? false;
  }

  async kick(id: string, userId: string): Promise<boolean> {
    const st = this.s(id);
    if (!st) return false;
    const removed = st.players.delete(userId);
    st.scores.delete(userId);
    st.kicked.add(userId);
    return removed;
  }

  async advance(id: string, p: AdvanceParams): Promise<AdvanceResult> {
    const st = this.s(id);
    if (!st) return { kind: "GONE" };
    const m = st.meta;
    if (m.version !== p.expectedVersion) return { kind: "VERSION", version: m.version };
    if (p.mode === "start" ? m.status !== "WAITING" : m.status !== "IN_PROGRESS" || m.phase !== "REVEAL") return { kind: "STATE", status: m.status };
    const next = m.currentIndex + 1;
    if (next >= p.total) return { kind: "END" };
    const now = this.now();
    Object.assign(m, { status: "IN_PROGRESS", phase: "QUESTION", currentIndex: next, questionStartedAtMs: now, deadlineAtMs: now + p.seconds * 1000, version: m.version + 1 });
    return { kind: "OK", index: next, startedAtMs: now, deadlineAtMs: m.deadlineAtMs, version: m.version };
  }

  async close(id: string, index: number): Promise<boolean> {
    const m = this.s(id)?.meta;
    if (!m || m.status !== "IN_PROGRESS" || m.phase !== "QUESTION" || m.currentIndex !== index) return false;
    m.phase = "REVEAL";
    return true;
  }

  async answer(id: string, p: AnswerParams): Promise<AnswerResult> {
    const st = this.s(id);
    if (!st) return { kind: "GONE" };
    const m = st.meta;
    if (m.status !== "IN_PROGRESS") return { kind: "STATE" };
    if (!st.players.has(p.userId)) return { kind: "NOT_PLAYER" };
    const now = this.now();
    if (m.phase !== "QUESTION" || m.currentIndex !== p.index || now > m.deadlineAtMs) return { kind: "CLOSED" };
    const corr = st.corrects[p.index];
    if (corr === undefined) return { kind: "GONE" };
    const [correct, optionCount] = corr.split(":").map(Number);
    if (p.choice < 0 || p.choice >= optionCount) return { kind: "BAD_CHOICE" };
    const elapsed = Math.max(0, now - m.questionStartedAtMs);
    const answers = st.answers.get(p.index) ?? new Map<string, { choice: number; ms: number }>();
    if (answers.has(p.userId)) return { kind: "DUP" };
    answers.set(p.userId, { choice: p.choice, ms: elapsed });
    st.answers.set(p.index, answers);
    const stats = st.stats.get(p.index) ?? {};
    stats[String(p.choice)] = (stats[String(p.choice)] ?? 0) + 1;
    st.stats.set(p.index, stats);
    let points = 0;
    if (p.choice === correct) {
      const span = p.seconds * 1000;
      points = p.base + Math.floor(p.bonus * (1 - Math.min(elapsed, span) / span));
      st.scores.set(p.userId, (st.scores.get(p.userId) ?? INITIAL_COMPOSITE) + points * TIEBREAK_BASE - elapsed);
    }
    return { kind: "OK", points, answered: answers.size, players: st.players.size };
  }

  async finish(id: string, expectedVersion: number | null, target: "FINISHED" | "CANCELLED", allowedFrom: readonly LiveQuizStatusValue[] | "*"): Promise<FinishResult> {
    const m = this.s(id)?.meta;
    if (!m) return { kind: "GONE" };
    if (m.status === "FINISHED" || m.status === "CANCELLED") return { kind: "ALREADY", status: m.status, version: m.version };
    if (expectedVersion !== null && m.version !== expectedVersion) return { kind: "VERSION", version: m.version };
    if (allowedFrom !== "*" && !allowedFrom.includes(m.status)) return { kind: "STATE", status: m.status };
    const prevStatus = m.status;
    Object.assign(m, { status: target, phase: "ENDED", version: m.version + 1 });
    return { kind: "OK", prevStatus, version: m.version };
  }

  async question(id: string, index: number): Promise<StoredQuestion | null> {
    return this.s(id)?.questions[index] ?? null;
  }

  async correctOf(id: string, index: number): Promise<{ correctIndex: number; optionCount: number } | null> {
    const raw = this.s(id)?.corrects[index];
    if (raw === undefined) return null;
    const [c, n] = raw.split(":");
    return { correctIndex: Number(c), optionCount: Number(n) };
  }

  async stats(id: string, index: number): Promise<Record<string, number>> {
    return { ...(this.s(id)?.stats.get(index) ?? {}) };
  }

  async answers(id: string, index: number): Promise<Map<string, { choice: number; ms: number }>> {
    return new Map(this.s(id)?.answers.get(index) ?? []);
  }

  async hasAnswered(id: string, index: number, userId: string): Promise<boolean> {
    return this.s(id)?.answers.get(index)?.has(userId) ?? false;
  }

  async counts(id: string, index: number): Promise<{ answered: number; players: number }> {
    const st = this.s(id);
    return { answered: st?.answers.get(index)?.size ?? 0, players: st?.players.size ?? 0 };
  }

  async scores(id: string): Promise<QuizScoreRow[]> {
    const st = this.s(id);
    if (!st) return [];
    // ZREVRANGE: điểm giảm dần; trùng điểm → thành viên (userId) theo thứ tự chữ giảm dần.
    const rows = [...st.scores.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));
    return rows.map(([userId, composite], i) => ({ userId, rank: i + 1, ...decodeComposite(composite) }));
  }

  async setHostLastSeen(id: string, ms: number): Promise<void> {
    const m = this.s(id)?.meta;
    if (m) m.hostLastSeenMs = ms;
  }

  async expireAll(id: string, _total: number, ttlSeconds: number): Promise<void> {
    const st = this.s(id);
    if (st) st.expiresAtMs = this.now() + ttlSeconds * 1000;
  }
}
