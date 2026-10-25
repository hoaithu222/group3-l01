import { newObjectId } from "../../../core/utils/object-id";
import {
  activeKeyOf,
  doneKeyOf,
  type MockAttempt,
  type MockAttemptCreateInput,
  type MockEventPatch,
  type MockFinalizePatch,
} from "../entities/mock.interface";
import { UniqueViolationError } from "./errors";
import type { IMockAttemptRepository, MockAttemptListParams } from "./mock-attempt.repository.interface";

/** Test — bản chép nông (`structuredClone`) khi trả ra để test không sửa nhầm dữ liệu trong kho. */
export class InMemoryMockAttemptRepository implements IMockAttemptRepository {
  readonly rows = new Map<string, MockAttempt>();
  now: () => Date = () => new Date();

  create(input: MockAttemptCreateInput): Promise<MockAttempt> {
    const activeKey = activeKeyOf(input.userId, input.setId);
    if ([...this.rows.values()].some((r) => r.activeKey === activeKey)) return Promise.reject(new UniqueViolationError("MockAttempt.activeKey"));
    const at = this.now();
    const row: MockAttempt = {
      ...structuredClone(input),
      id: input.id || newObjectId(),
      status: "IN_PROGRESS",
      activeKey,
      submittedAt: null,
      submitMode: null,
      answeredCount: 0,
      correctCount: null,
      scorePct: null,
      passed: null,
      byTag: [],
      backgroundCount: 0,
      backgroundMs: 0,
      lastBackgroundAt: null,
      eventCount: 0,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.set(row.id, row);
    return Promise.resolve(structuredClone(row));
  }

  findById(id: string): Promise<MockAttempt | null> {
    const r = this.rows.get(id);
    return Promise.resolve(r ? structuredClone(r) : null);
  }

  findActive(userId: string, setId: string): Promise<MockAttempt | null> {
    const key = activeKeyOf(userId, setId);
    const r = [...this.rows.values()].find((x) => x.activeKey === key);
    return Promise.resolve(r ? structuredClone(r) : null);
  }

  finalizeIf(id: string, patch: MockFinalizePatch): Promise<MockAttempt | null> {
    const r = this.rows.get(id);
    if (!r || r.status !== "IN_PROGRESS") return Promise.resolve(null);
    Object.assign(r, patch, { activeKey: doneKeyOf(id), version: r.version + 1, updatedAt: this.now() });
    return Promise.resolve(structuredClone(r));
  }

  setAnsweredCount(id: string, count: number): Promise<void> {
    const r = this.rows.get(id);
    if (r && r.status === "IN_PROGRESS") r.answeredCount = count;
    return Promise.resolve();
  }

  applyEvent(id: string, expectedEventCount: number, patch: MockEventPatch): Promise<boolean> {
    const r = this.rows.get(id);
    if (!r || r.status !== "IN_PROGRESS" || r.eventCount !== expectedEventCount) return Promise.resolve(false);
    r.eventCount += 1;
    r.lastBackgroundAt = patch.lastBackgroundAt;
    if (patch.backgroundCount !== undefined) r.backgroundCount = patch.backgroundCount;
    if (patch.backgroundMs !== undefined) r.backgroundMs = patch.backgroundMs;
    return Promise.resolve(true);
  }

  countStartedSince(userId: string, setId: string, since: Date): Promise<number> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.userId === userId && r.setId === setId && r.startedAt >= since).length);
  }

  list(params: MockAttemptListParams): Promise<MockAttempt[]> {
    const after = params.after;
    const rows = [...this.rows.values()]
      .filter((r) => r.userId === params.userId && (!params.setId || r.setId === params.setId))
      .filter((r) => !after || r.startedAt < after.at || (r.startedAt.getTime() === after.at.getTime() && r.id < after.id))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, params.limit);
    return Promise.resolve(rows.map((r) => structuredClone(r)));
  }

  deleteByUser(userId: string): Promise<number> {
    let n = 0;
    for (const [id, r] of this.rows) if (r.userId === userId) (this.rows.delete(id), (n += 1));
    return Promise.resolve(n);
  }
}
