import { newObjectId } from "../../../core/utils/object-id";
import type { WellbeingDailyEntity, WellbeingDailyInput } from "../entities/burnout.interface";
import type { IWellbeingDailyRepository } from "./daily.repository.interface";
import type { TxHandle } from "./tx";

export class InMemoryWellbeingDailyRepository implements IWellbeingDailyRepository {
  /** Khoá `${userId}|${date}`. */
  readonly rows = new Map<string, WellbeingDailyEntity>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  findByDate(userId: string, date: string): Promise<WellbeingDailyEntity | null> {
    const row = this.rows.get(`${userId}|${date}`);
    return Promise.resolve(row ? { ...row } : null);
  }

  upsert(input: WellbeingDailyInput): Promise<WellbeingDailyEntity> {
    const key = `${input.userId}|${input.date}`;
    const prev = this.rows.get(key);
    const next: WellbeingDailyEntity = { ...input, id: prev?.id ?? newObjectId(), createdAt: prev?.createdAt ?? this.clock() };
    this.rows.set(key, next);
    return Promise.resolve({ ...next });
  }

  listSince(userId: string, fromDate: string): Promise<WellbeingDailyEntity[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.userId === userId && r.date >= fromDate).sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => ({ ...r })));
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
}
