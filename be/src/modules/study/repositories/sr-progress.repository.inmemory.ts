import { newObjectId } from "../../../core/utils/object-id";
import type { SrDueQuery, SrProgress, SrProgressCreateInput, SrProgressPatch, SrSuspendReason } from "../entities/sr.interface";
import { resumeStatus } from "../services/sm2";
import type { ISrProgressRepository } from "./sr-progress.repository.interface";

const DUE = new Set(["LEARNING", "REVIEW"]);

export class InMemorySrProgressRepository implements ISrProgressRepository {
  readonly rows = new Map<string, SrProgress>();
  now: () => Date = () => new Date();

  private mine(userId: string): SrProgress[] {
    return [...this.rows.values()].filter((r) => r.userId === userId);
  }

  private clone(r: SrProgress | undefined): SrProgress | null {
    return r ? structuredClone(r) : null;
  }

  findByUserItem(userId: string, itemId: string): Promise<SrProgress | null> {
    return Promise.resolve(this.clone(this.mine(userId).find((r) => r.itemId === itemId)));
  }

  findByUserItems(userId: string, itemIds: readonly string[]): Promise<SrProgress[]> {
    return Promise.resolve(this.mine(userId).filter((r) => itemIds.includes(r.itemId)).map((r) => structuredClone(r)));
  }

  createMissing(rows: readonly SrProgressCreateInput[]): Promise<number> {
    let created = 0;
    for (const p of rows) {
      if (this.mine(p.userId).some((r) => r.itemId === p.itemId)) continue;
      const at = this.now();
      const id = newObjectId();
      this.rows.set(id, { ...structuredClone(p), id, suspendedReason: null, version: 1, createdAt: at, updatedAt: at });
      created += 1;
    }
    return Promise.resolve(created);
  }

  updateIf(id: string, expectedVersion: number, patch: SrProgressPatch): Promise<SrProgress | null> {
    const r = this.rows.get(id);
    if (!r || r.version !== expectedVersion) return Promise.resolve(null);
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) (r as unknown as Record<string, unknown>)[k] = v;
    r.version += 1;
    r.updatedAt = this.now();
    return Promise.resolve(structuredClone(r));
  }

  private dueRows(userId: string, before: Date, setIds?: readonly string[]): SrProgress[] {
    return this.mine(userId)
      .filter((r) => DUE.has(r.status) && r.nextReviewAt < before && (!setIds || setIds.includes(r.setId)))
      .sort((a, b) => a.nextReviewAt.getTime() - b.nextReviewAt.getTime() || (a.id < b.id ? -1 : 1));
  }

  listDue(userId: string, q: SrDueQuery): Promise<SrProgress[]> {
    return Promise.resolve(this.dueRows(userId, q.before, q.setIds).slice(0, q.limit).map((r) => structuredClone(r)));
  }

  countDue(userId: string, before: Date, setIds?: readonly string[]): Promise<number> {
    return Promise.resolve(this.dueRows(userId, before, setIds).length);
  }

  private newRows(userId: string, setId: string): SrProgress[] {
    return this.mine(userId)
      .filter((r) => r.setId === setId && r.status === "NEW")
      .sort((a, b) => a.itemOrder - b.itemOrder || (a.id < b.id ? -1 : 1));
  }

  listNew(userId: string, setId: string, limit: number): Promise<SrProgress[]> {
    return Promise.resolve(limit <= 0 ? [] : this.newRows(userId, setId).slice(0, limit).map((r) => structuredClone(r)));
  }

  countNew(userId: string, setId: string): Promise<number> {
    return Promise.resolve(this.newRows(userId, setId).length);
  }

  listSetIds(userId: string): Promise<string[]> {
    return Promise.resolve([...new Set(this.mine(userId).map((r) => r.setId))]);
  }

  listSuspendedSetIds(userId: string): Promise<string[]> {
    return Promise.resolve([...new Set(this.mine(userId).filter((r) => r.status === "SUSPENDED").map((r) => r.setId))]);
  }

  suspendBySets(userId: string, setIds: readonly string[], reason: SrSuspendReason): Promise<number> {
    let n = 0;
    for (const r of this.mine(userId)) {
      if (!setIds.includes(r.setId) || r.status === "SUSPENDED") continue;
      Object.assign(r, { status: "SUSPENDED", suspendedReason: reason, version: r.version + 1 });
      n += 1;
    }
    return Promise.resolve(n);
  }

  reopenBySet(userId: string, setId: string): Promise<number> {
    let n = 0;
    for (const r of this.mine(userId)) {
      if (r.setId !== setId || r.status !== "SUSPENDED" || !["LOST_ACCESS", "SET_HIDDEN"].includes(r.suspendedReason ?? "")) continue;
      Object.assign(r, { status: resumeStatus(r), suspendedReason: null, version: r.version + 1 });
      n += 1;
    }
    return Promise.resolve(n);
  }

  listDueDates(userId: string, from: Date, to: Date, setIds?: readonly string[]): Promise<Date[]> {
    return Promise.resolve(
      this.mine(userId)
        .filter((r) => DUE.has(r.status) && r.nextReviewAt >= from && r.nextReviewAt < to && (!setIds || setIds.includes(r.setId)))
        .map((r) => r.nextReviewAt)
    );
  }

  deleteByItems(itemIds: readonly string[]): Promise<number> {
    let n = 0;
    for (const [id, r] of this.rows) if (itemIds.includes(r.itemId)) (this.rows.delete(id), (n += 1));
    return Promise.resolve(n);
  }

  deleteByUser(userId: string): Promise<number> {
    let n = 0;
    for (const [id, r] of this.rows) if (r.userId === userId) (this.rows.delete(id), (n += 1));
    return Promise.resolve(n);
  }

  listCandidateUserIds(before: Date, opts: { afterUserId?: string; limit: number }): Promise<string[]> {
    const ids = new Set(
      [...this.rows.values()].filter((r) => ["NEW", ...DUE].includes(r.status) && r.nextReviewAt < before && (!opts.afterUserId || r.userId > opts.afterUserId)).map((r) => r.userId)
    );
    return Promise.resolve([...ids].sort().slice(0, opts.limit));
  }
}
