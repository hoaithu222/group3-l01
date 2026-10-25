import { newObjectId } from "../../../core/utils/object-id";
import type { LiveQuizResult, LiveQuizResultCreateInput, LiveQuizSession, LiveQuizSessionCreateInput } from "../entities/live-quiz.interface";
import type { AdminSessionListParams, ILiveQuizRepository, SessionCloseInput, SessionProgressMirror } from "./live-quiz.repository.interface";
import type { Restorable } from "./tx.inmemory";
import type { TxHandle } from "./tx";

const OPEN = ["WAITING", "IN_PROGRESS"];

interface RepoState {
  sessions: Map<string, LiveQuizSession>;
  results: LiveQuizResult[];
}

/**
 * Repository trong bộ nhớ cho test (unit + tích hợp không cần Mongo). Giữ đúng ràng buộc của bản Prisma: CAS đóng phiên/`resultsPersistedAt`,
 * unique `(sessionId, userId)` ở `LiveQuizResult` (trùng → ném lỗi thay vì âm thầm ghi đè), `updatedAt` đổi theo mỗi lần ghi
 * (cron dọn phiên treo dựa vào đó) và hỗ trợ hoàn tác khi transaction giả (`InMemoryTxRunner`) lỗi.
 */
export class InMemoryLiveQuizRepository implements ILiveQuizRepository, Restorable {
  private state: RepoState = { sessions: new Map(), results: [] };

  constructor(private readonly now: () => number = Date.now) {}

  snapshot(): RepoState {
    return { sessions: new Map([...this.state.sessions].map(([k, v]) => [k, { ...v }])), results: this.state.results.map((r) => ({ ...r })) };
  }

  restore(s: unknown): void {
    this.state = s as RepoState;
  }

  private touch(s: LiveQuizSession): void {
    s.updatedAt = new Date(this.now());
  }

  /** Test: chỉnh trực tiếp (vd lùi `updatedAt` để cron coi phiên là treo). */
  patch(id: string, patch: Partial<LiveQuizSession>): void {
    const s = this.state.sessions.get(id);
    if (s) Object.assign(s, patch);
  }

  async create(input: LiveQuizSessionCreateInput): Promise<LiveQuizSession> {
    const at = new Date(this.now());
    const session: LiveQuizSession = {
      ...input,
      status: "WAITING",
      currentIndex: -1,
      questionStartedAt: null,
      deadlineAt: null,
      playersCount: 0,
      version: 1,
      startedAt: null,
      endedAt: null,
      endReason: null,
      resultsPersistedAt: null,
      createdAt: at,
      updatedAt: at,
    };
    this.state.sessions.set(input.id, session);
    return { ...session };
  }

  async findById(id: string): Promise<LiveQuizSession | null> {
    const s = this.state.sessions.get(id);
    return s ? { ...s } : null;
  }

  async mirrorProgress(id: string, m: SessionProgressMirror): Promise<void> {
    const s = this.state.sessions.get(id);
    if (!s || s.version >= m.version || !OPEN.includes(s.status)) return;
    Object.assign(s, { version: m.version, status: m.status, currentIndex: m.currentIndex, questionStartedAt: m.questionStartedAt, deadlineAt: m.deadlineAt });
    if (m.startedAt) s.startedAt = m.startedAt;
    this.touch(s);
  }

  async closeIfOpen(id: string, input: SessionCloseInput, _tx?: TxHandle): Promise<boolean> {
    const s = this.state.sessions.get(id);
    if (!s || !OPEN.includes(s.status)) return false;
    Object.assign(s, { status: input.status, endReason: input.endReason, endedAt: input.endedAt, version: input.version, playersCount: input.playersCount });
    this.touch(s);
    return true;
  }

  async markPersistedIf(id: string, at: Date, _tx?: TxHandle): Promise<boolean> {
    const s = this.state.sessions.get(id);
    if (!s || s.status !== "FINISHED" || s.resultsPersistedAt !== null) return false;
    s.resultsPersistedAt = at;
    this.touch(s);
    return true;
  }

  async createResults(rows: LiveQuizResultCreateInput[], _tx?: TxHandle): Promise<void> {
    for (const r of rows) {
      if (this.state.results.some((x) => x.sessionId === r.sessionId && x.userId === r.userId)) {
        throw new Error(`Duplicate key (sessionId, userId) = (${r.sessionId}, ${r.userId})`);
      }
      this.state.results.push({ ...r, id: newObjectId(), createdAt: new Date(this.now()) });
    }
  }

  async listResults(sessionId: string): Promise<LiveQuizResult[]> {
    return this.state.results.filter((r) => r.sessionId === sessionId).sort((a, b) => a.rank - b.rank);
  }

  async findResult(sessionId: string, userId: string): Promise<LiveQuizResult | null> {
    return this.state.results.find((r) => r.sessionId === sessionId && r.userId === userId) ?? null;
  }

  async listResultsByUser(userId: string, after: { at: Date; id: string } | null, limit: number): Promise<LiveQuizResult[]> {
    const before = (r: LiveQuizResult): boolean =>
      !after || r.createdAt < after.at || (r.createdAt.getTime() === after.at.getTime() && r.id < after.id);
    return this.state.results
      .filter((r) => r.userId === userId && before(r))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, limit);
  }

  async findByIds(ids: string[]): Promise<LiveQuizSession[]> {
    return ids.flatMap((id) => {
      const s = this.state.sessions.get(id);
      return s ? [{ ...s }] : [];
    });
  }

  async findStale(waitingBefore: Date, inProgressBefore: Date, limit: number): Promise<LiveQuizSession[]> {
    return [...this.state.sessions.values()]
      .filter((s) => (s.status === "WAITING" && s.updatedAt < waitingBefore) || (s.status === "IN_PROGRESS" && s.updatedAt < inProgressBefore))
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }

  async adminList(p: AdminSessionListParams): Promise<{ items: LiveQuizSession[]; total: number }> {
    const all = [...this.state.sessions.values()].filter((s) => !p.status || s.status === p.status).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { items: all.slice((p.page - 1) * p.limit, p.page * p.limit).map((s) => ({ ...s })), total: all.length };
  }
}
