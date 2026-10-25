import { newObjectId } from "../../../core/utils/object-id";
import type { SrReviewLog, SrReviewLogCreateInput } from "../entities/sr.interface";
import { UniqueViolationError } from "./errors";
import type { ISrReviewLogRepository } from "./sr-review-log.repository.interface";

export class InMemorySrReviewLogRepository implements ISrReviewLogRepository {
  readonly rows: SrReviewLog[] = [];

  findByClientId(userId: string, clientReviewId: string): Promise<SrReviewLog | null> {
    const r = this.rows.find((x) => x.userId === userId && x.clientReviewId === clientReviewId);
    return Promise.resolve(r ? structuredClone(r) : null);
  }

  create(row: SrReviewLogCreateInput): Promise<SrReviewLog> {
    if (this.rows.some((x) => x.userId === row.userId && x.clientReviewId === row.clientReviewId)) {
      return Promise.reject(new UniqueViolationError("SrReviewLog.clientReviewId"));
    }
    const created: SrReviewLog = { ...structuredClone(row), id: newObjectId() };
    this.rows.push(created);
    return Promise.resolve(structuredClone(created));
  }

  countByDate(userId: string, localDate: string, opts: { newOnly?: boolean; setId?: string } = {}): Promise<number> {
    return Promise.resolve(
      this.rows.filter((r) => r.userId === userId && r.localDate === localDate && (!opts.newOnly || r.prevInterval === 0) && (!opts.setId || r.setId === opts.setId)).length
    );
  }

  existsForItemDate(userId: string, itemId: string, localDate: string): Promise<boolean> {
    return Promise.resolve(this.rows.some((r) => r.userId === userId && r.itemId === itemId && r.localDate === localDate));
  }

  listLocalDates(userId: string, sinceDate: string): Promise<string[]> {
    return Promise.resolve([...new Set(this.rows.filter((r) => r.userId === userId && r.localDate >= sinceDate).map((r) => r.localDate))]);
  }

  deleteByUser(userId: string): Promise<number> {
    const before = this.rows.length;
    for (let i = this.rows.length - 1; i >= 0; i -= 1) if (this.rows[i].userId === userId) this.rows.splice(i, 1);
    return Promise.resolve(before - this.rows.length);
  }
}
