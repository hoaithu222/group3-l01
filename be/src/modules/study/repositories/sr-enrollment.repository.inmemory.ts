import { newObjectId } from "../../../core/utils/object-id";
import type { SrEnrollment } from "../entities/sr.interface";
import type { ISrEnrollmentRepository } from "./sr-enrollment.repository.interface";

export class InMemorySrEnrollmentRepository implements ISrEnrollmentRepository {
  readonly rows = new Map<string, SrEnrollment>();
  now: () => Date = () => new Date();

  private locate(userId: string, setId: string): SrEnrollment | undefined {
    return [...this.rows.values()].find((r) => r.userId === userId && r.setId === setId);
  }

  upsert(userId: string, setId: string, opts: { newPerDay?: number; defaultNewPerDay: number }): Promise<SrEnrollment> {
    let row = this.locate(userId, setId);
    if (row) {
      row.active = true;
      if (opts.newPerDay !== undefined) row.newPerDay = opts.newPerDay;
    } else {
      const at = this.now();
      row = { id: newObjectId(), userId, setId, active: true, newPerDay: opts.newPerDay ?? opts.defaultNewPerDay, syncedVersion: 0, createdAt: at, updatedAt: at };
      this.rows.set(row.id, row);
    }
    return Promise.resolve(structuredClone(row));
  }

  find(userId: string, setId: string): Promise<SrEnrollment | null> {
    const r = this.locate(userId, setId);
    return Promise.resolve(r ? structuredClone(r) : null);
  }

  listActive(userId: string, setIds?: readonly string[]): Promise<SrEnrollment[]> {
    return Promise.resolve(
      [...this.rows.values()].filter((r) => r.userId === userId && r.active && (!setIds || setIds.includes(r.setId))).map((r) => structuredClone(r))
    );
  }

  deactivate(userId: string, setId: string): Promise<boolean> {
    const r = this.locate(userId, setId);
    if (!r) return Promise.resolve(false);
    r.active = false;
    return Promise.resolve(true);
  }

  markSynced(id: string, setVersion: number): Promise<void> {
    const r = this.rows.get(id);
    if (r) r.syncedVersion = setVersion;
    return Promise.resolve();
  }

  deleteByUser(userId: string): Promise<number> {
    let n = 0;
    for (const [id, r] of this.rows) if (r.userId === userId) (this.rows.delete(id), (n += 1));
    return Promise.resolve(n);
  }
}
