import { newObjectId } from "../../../core/utils/object-id";
import type {
  NewPomodoroSession,
  PomodoroHistoryRow,
  PomodoroPresenceEntity,
  PomodoroSessionEntity,
  PomodoroSessionPatch,
} from "../entities/pomodoro.interface";
import {
  PomodoroActiveConflictError,
  type HistoryCursor,
  type IPomodoroRepository,
  type JoinMark,
  type SessionCas,
} from "./pomodoro.repository.interface";
import type { TxHandle } from "./tx";

const RUNNING = new Set(["FOCUS", "SHORT_BREAK", "LONG_BREAK"]);
const secondsBetween = (from: Date, to: Date): number => Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));

/** Repository trong bộ nhớ cho unit test service/runner — cùng ngữ nghĩa CAS + unique `activeKey` + presence idempotent như bản Prisma. */
export class InMemoryPomodoroRepository implements IPomodoroRepository {
  readonly sessions = new Map<string, PomodoroSessionEntity>();
  readonly presences: PomodoroPresenceEntity[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  findById(id: string): Promise<PomodoroSessionEntity | null> {
    const s = this.sessions.get(id);
    return Promise.resolve(s ? { ...s } : null);
  }

  findActiveByChannel(channelId: string): Promise<PomodoroSessionEntity | null> {
    const s = [...this.sessions.values()].find((x) => x.activeKey === channelId);
    return Promise.resolve(s ? { ...s } : null);
  }

  findByCallId(callId: string): Promise<PomodoroSessionEntity | null> {
    const list = [...this.sessions.values()].filter((x) => x.callId === callId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(list[0] ? { ...list[0] } : null);
  }

  listOverdueRunning(before: Date, limit: number): Promise<PomodoroSessionEntity[]> {
    const list = [...this.sessions.values()]
      .filter((s) => RUNNING.has(s.phase) && s.phaseEndsAt !== null && s.phaseEndsAt.getTime() <= before.getTime())
      .sort((a, b) => (a.phaseEndsAt?.getTime() ?? 0) - (b.phaseEndsAt?.getTime() ?? 0));
    return Promise.resolve(list.slice(0, limit).map((s) => ({ ...s })));
  }

  listActive(limit: number): Promise<PomodoroSessionEntity[]> {
    return Promise.resolve([...this.sessions.values()].filter((s) => s.phase !== "ENDED").slice(0, limit).map((s) => ({ ...s })));
  }

  createSession(_tx: TxHandle | undefined, s: NewPomodoroSession): Promise<PomodoroSessionEntity> {
    if ([...this.sessions.values()].some((x) => x.activeKey === s.channelId)) return Promise.reject(new PomodoroActiveConflictError());
    const at = this.now();
    const entity: PomodoroSessionEntity = { ...s, id: s.id || newObjectId(), activeKey: s.channelId, version: 1, createdAt: at, updatedAt: at };
    this.sessions.set(entity.id, entity);
    return Promise.resolve({ ...entity });
  }

  updateSession(_tx: TxHandle | undefined, id: string, cas: SessionCas, patch: PomodoroSessionPatch): Promise<PomodoroSessionEntity | null> {
    const cur = this.sessions.get(id);
    if (!cur || cur.version !== cas.version || (cas.phase && cur.phase !== cas.phase)) return Promise.resolve(null);
    const next: PomodoroSessionEntity = { ...cur, ...patch, version: cur.version + 1, updatedAt: this.now() };
    if (patch.phase === "ENDED") next.activeKey = `ended:${id}`;
    this.sessions.set(id, next);
    return Promise.resolve({ ...next });
  }

  linkCall(id: string, callId: string): Promise<void> {
    const cur = this.sessions.get(id);
    if (cur) this.sessions.set(id, { ...cur, callId });
    return Promise.resolve();
  }

  private row(sessionId: string, userId: string): PomodoroPresenceEntity | undefined {
    return this.presences.find((p) => p.sessionId === sessionId && p.userId === userId);
  }

  findPresence(sessionId: string, userId: string): Promise<PomodoroPresenceEntity | null> {
    const r = this.row(sessionId, userId);
    return Promise.resolve(r ? { ...r } : null);
  }

  listPresence(sessionId: string): Promise<PomodoroPresenceEntity[]> {
    return Promise.resolve(this.presences.filter((p) => p.sessionId === sessionId).map((p) => ({ ...p })));
  }

  markJoined(sessionId: string, userId: string, at: Date): Promise<JoinMark> {
    const r = this.row(sessionId, userId);
    if (!r) {
      this.presences.push({ id: newObjectId(), sessionId, userId, joinedAt: at, leftAt: null, presentSeconds: 0, cyclesAttended: 0, interruptions: 0, goal: null, goalShared: false });
      return Promise.resolve("CREATED");
    }
    if (r.leftAt === null) return Promise.resolve("NOOP");
    r.leftAt = null;
    r.joinedAt = at;
    r.interruptions += 1;
    return Promise.resolve("REJOINED");
  }

  markLeft(sessionId: string, userId: string, at: Date): Promise<boolean> {
    const r = this.row(sessionId, userId);
    if (!r || r.leftAt !== null) return Promise.resolve(false);
    r.presentSeconds += secondsBetween(r.joinedAt, at);
    r.leftAt = at;
    return Promise.resolve(true);
  }

  incrementCyclesAttended(_tx: TxHandle | undefined, sessionId: string, phaseStartedAt: Date): Promise<number> {
    let n = 0;
    for (const p of this.presences) {
      if (p.sessionId === sessionId && p.leftAt === null && p.joinedAt.getTime() <= phaseStartedAt.getTime()) {
        p.cyclesAttended += 1;
        n += 1;
      }
    }
    return Promise.resolve(n);
  }

  finalizePresence(_tx: TxHandle | undefined, sessionId: string, at: Date): Promise<void> {
    for (const p of this.presences) {
      if (p.sessionId === sessionId && p.leftAt === null) {
        p.presentSeconds += secondsBetween(p.joinedAt, at);
        p.leftAt = at;
      }
    }
    return Promise.resolve();
  }

  async setGoal(sessionId: string, userId: string, at: Date, goal: string | null, shared: boolean): Promise<PomodoroPresenceEntity> {
    await this.markJoined(sessionId, userId, at);
    const r = this.row(sessionId, userId)!;
    r.goal = goal;
    r.goalShared = goal ? shared : false;
    return { ...r };
  }

  listHistory(userId: string, cursor: HistoryCursor | null, limit: number): Promise<PomodoroHistoryRow[]> {
    const rows = this.presences
      .filter((p) => p.userId === userId)
      .filter((p) => !cursor || p.joinedAt.getTime() < cursor.at.getTime() || (p.joinedAt.getTime() === cursor.at.getTime() && p.id < cursor.id))
      .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, limit + 1);
    return Promise.resolve(
      rows.flatMap((p) => {
        const session = this.sessions.get(p.sessionId);
        return session ? [{ presence: { ...p }, session: { ...session } }] : [];
      })
    );
  }
}
