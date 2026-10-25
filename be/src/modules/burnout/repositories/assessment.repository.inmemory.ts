import { newObjectId } from "../../../core/utils/object-id";
import type { AckAction, AssessmentScoreInput, BurnoutAssessmentEntity } from "../entities/burnout.interface";
import type { WellbeingLevel } from "../domain/burnout-rules";
import type { IBurnoutAssessmentRepository } from "./assessment.repository.interface";
import type { TxHandle } from "./tx";

export class InMemoryBurnoutAssessmentRepository implements IBurnoutAssessmentRepository {
  /** Khoá `${userId}|${date}`. */
  readonly rows = new Map<string, BurnoutAssessmentEntity>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  private byId(id: string): [string, BurnoutAssessmentEntity] | null {
    for (const entry of this.rows) if (entry[1].id === id) return entry;
    return null;
  }

  findOwned(id: string, userId: string): Promise<BurnoutAssessmentEntity | null> {
    const found = this.byId(id);
    return Promise.resolve(found && found[1].userId === userId ? { ...found[1] } : null);
  }

  findByDate(userId: string, date: string): Promise<BurnoutAssessmentEntity | null> {
    const row = this.rows.get(`${userId}|${date}`);
    return Promise.resolve(row ? { ...row } : null);
  }

  upsertScore(input: AssessmentScoreInput): Promise<BurnoutAssessmentEntity> {
    const key = `${input.userId}|${input.date}`;
    const prev = this.rows.get(key);
    const next: BurnoutAssessmentEntity = prev
      ? { ...prev, riskScore: input.riskScore, level: input.level, factors: input.factors, ruleVersion: input.ruleVersion }
      : { ...input, id: newObjectId(), alerted: false, alertedAt: null, ackAction: null, ackAt: null, createdAt: this.clock() };
    this.rows.set(key, next);
    return Promise.resolve({ ...next });
  }

  markAlerted(id: string, now: Date, _tx?: TxHandle): Promise<boolean> {
    const found = this.byId(id);
    if (!found || found[1].alerted) return Promise.resolve(false);
    this.rows.set(found[0], { ...found[1], alerted: true, alertedAt: now });
    return Promise.resolve(true);
  }

  acknowledge(id: string, userId: string, action: AckAction, now: Date, _tx?: TxHandle): Promise<boolean> {
    const found = this.byId(id);
    if (!found || found[1].userId !== userId || !found[1].alerted || found[1].ackAction !== null) return Promise.resolve(false);
    this.rows.set(found[0], { ...found[1], ackAction: action, ackAt: now });
    return Promise.resolve(true);
  }

  listSince(userId: string, fromDate: string): Promise<BurnoutAssessmentEntity[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.userId === userId && r.date >= fromDate).sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({ ...r })));
  }

  latest(userId: string): Promise<BurnoutAssessmentEntity | null> {
    const mine = [...this.rows.values()].filter((r) => r.userId === userId).sort((a, b) => (a.date < b.date ? 1 : -1));
    return Promise.resolve(mine[0] ? { ...mine[0] } : null);
  }

  deleteByUser(userId: string, _tx?: TxHandle): Promise<number> {
    let removed = 0;
    for (const [key, row] of this.rows) {
      if (row.userId === userId) {
        this.rows.delete(key);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }

  deleteCreatedBefore(cutoff: Date): Promise<number> {
    let removed = 0;
    for (const [key, row] of this.rows) {
      if (row.createdAt.getTime() < cutoff.getTime()) {
        this.rows.delete(key);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }

  latestForUsers(userIds: readonly string[], sinceDate: string): Promise<Map<string, { level: WellbeingLevel; date: string }>> {
    const ids = new Set(userIds);
    const out = new Map<string, { level: WellbeingLevel; date: string }>();
    for (const r of this.rows.values()) {
      if (!ids.has(r.userId) || r.date < sinceDate) continue;
      const current = out.get(r.userId);
      if (!current || r.date > current.date) out.set(r.userId, { level: r.level, date: r.date });
    }
    return Promise.resolve(out);
  }
}
